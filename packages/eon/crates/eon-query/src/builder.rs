//! SELECT builder — compiles a query description into parameterised TDengine SQL.
//!
//! 58.1 scope: `SELECT <cols> FROM <table> [WHERE ...] [LIMIT n]` with backtick
//! identifiers and `?` placeholders. Time-window clauses
//! (`INTERVAL`/`SLIDING`/`FILL`/`PARTITION BY`) are DEFERRED to story 58.5 and
//! rejected here with a typed error rather than silently dropped (D6).

use crate::dialect::Dialect;
use crate::identifier::validate_operator;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhereClause {
    pub column: String,
    #[serde(default = "default_eq")]
    pub operator: String,
    #[serde(default)]
    pub value: Value,
    #[serde(rename = "type", default = "default_and")]
    pub clause_type: String,
}

fn default_eq() -> String {
    "=".to_string()
}
fn default_and() -> String {
    "and".to_string()
}
fn default_select() -> Vec<String> {
    vec!["*".to_string()]
}

/// A SELECT query description sent from TypeScript. Unknown fields are ignored
/// for forward-compat, EXCEPT the explicitly-declared time-window fields, which
/// are rejected (58.5).
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryDescription {
    pub table: String,
    #[serde(default = "default_select")]
    pub select: Vec<String>,
    #[serde(default)]
    pub wheres: Vec<WhereClause>,
    #[serde(default)]
    pub limit: Option<u64>,

    // --- Deferred time-window clauses (58.5) — declared only so a spec that
    // carries one is rejected with a clear error, never miscompiled. ---
    #[serde(default)]
    pub interval: Option<Value>,
    #[serde(default)]
    pub sliding: Option<Value>,
    #[serde(default)]
    pub fill: Option<Value>,
    #[serde(default)]
    pub partition_by: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompileResult {
    pub sql: String,
    pub params: Vec<Value>,
}

pub fn compile_select(desc: &QueryDescription, dialect: Dialect) -> Result<CompileResult, String> {
    if desc.interval.is_some()
        || desc.sliding.is_some()
        || desc.fill.is_some()
        || !desc.partition_by.is_empty()
    {
        return Err(
            "E_UNSUPPORTED_CLAUSE: time-window compilation (INTERVAL/SLIDING/FILL/PARTITION BY) is deferred to story 58.5"
                .into(),
        );
    }

    let mut params: Vec<Value> = Vec::new();
    // An explicit empty `select: []` (as opposed to an absent field, which
    // serde defaults to `*`) must not compile to `SELECT  FROM …`; treat it
    // identically to the absent-field default.
    let select_cols: Result<Vec<String>, String> = if desc.select.is_empty() {
        Ok(vec!["*".to_string()])
    } else {
        desc.select.iter().map(|c| dialect.quote_ident(c)).collect()
    };
    let table = dialect.quote_ident(&desc.table)?;
    let mut sql = format!("SELECT {} FROM {}", select_cols?.join(", "), table);

    if !desc.wheres.is_empty() {
        let mut clauses: Vec<String> = Vec::with_capacity(desc.wheres.len());
        for (i, w) in desc.wheres.iter().enumerate() {
            // The first clause is always `WHERE`; its `type` is unused. For the
            // rest the connector is a strict allowlist — an unknown value (typo,
            // `"xor"`) is rejected, never silently coerced to `AND` (quietly
            // wrong result sets), matching the operator-allowlist discipline.
            let prefix = if i == 0 {
                "WHERE"
            } else {
                match w.clause_type.to_ascii_lowercase().as_str() {
                    "and" => "AND",
                    "or" => "OR",
                    other => {
                        return Err(format!(
                            "E_INVALID_CLAUSE_TYPE: WHERE connector must be 'and' or 'or', got '{}'",
                            other
                        ));
                    }
                }
            };
            let op = validate_operator(&w.operator)?;
            let col = dialect.quote_ident(&w.column)?;
            match op {
                "IS NULL" => clauses.push(format!("{} {} IS NULL", prefix, col)),
                "IS NOT NULL" => clauses.push(format!("{} {} IS NOT NULL", prefix, col)),
                "IN" | "NOT IN" => {
                    let arr = w
                        .value
                        .as_array()
                        .ok_or_else(|| format!("{} operator requires an array value", op))?;
                    if arr.is_empty() {
                        let expr = if op == "IN" { "1 = 0" } else { "1 = 1" };
                        clauses.push(format!("{} {}", prefix, expr));
                    } else {
                        let placeholders: Vec<String> = arr
                            .iter()
                            .map(|v| {
                                // Mirror the scalar arm: an array/object element is
                                // ill-typed, and a null element silently never matches
                                // inside `IN (...)`. Reject rather than bind a dead param.
                                if v.is_array() || v.is_object() {
                                    return Err(format!(
                                        "E_INVALID_WHERE_VALUE: '{}' list element must be a scalar, not a JSON {}",
                                        op,
                                        if v.is_array() { "array" } else { "object" }
                                    ));
                                }
                                if v.is_null() {
                                    return Err(format!(
                                        "E_INVALID_WHERE_VALUE: '{}' list contains a null element, which never matches; remove it or use 'IS NULL'",
                                        op
                                    ));
                                }
                                params.push(v.clone());
                                Ok(dialect.placeholder(params.len() as u32))
                            })
                            .collect::<Result<_, _>>()?;
                        clauses.push(format!(
                            "{} {} {} ({})",
                            prefix,
                            col,
                            op,
                            placeholders.join(", ")
                        ));
                    }
                }
                _ => {
                    // Scalar operators bind exactly one `?`; a JSON array/object
                    // value would be pushed as a single ill-typed STMT param
                    // that fails opaquely downstream (arrays are only meaningful
                    // for IN/NOT IN, handled above).
                    if w.value.is_array() || w.value.is_object() {
                        return Err(format!(
                            "E_INVALID_WHERE_VALUE: operator '{}' requires a scalar value, not a JSON {}",
                            op,
                            if w.value.is_array() { "array" } else { "object" }
                        ));
                    }
                    // A null bound to `col = ?` never matches (SQL `= NULL`) — the
                    // query would silently return zero rows. Reject and steer to
                    // the explicit null predicates instead of miscompiling.
                    if w.value.is_null() {
                        return Err(format!(
                            "E_INVALID_WHERE_VALUE: operator '{}' with a null value never matches; use 'IS NULL' / 'IS NOT NULL'",
                            op
                        ));
                    }
                    params.push(w.value.clone());
                    let p = dialect.placeholder(params.len() as u32);
                    clauses.push(format!("{} {} {} {}", prefix, col, op, p));
                }
            }
        }
        sql.push(' ');
        sql.push_str(&clauses.join(" "));
    }

    if let Some(limit) = desc.limit {
        sql.push_str(&format!(" LIMIT {}", limit));
    }

    Ok(CompileResult { sql, params })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn desc(json_str: &str) -> QueryDescription {
        serde_json::from_str(json_str).unwrap()
    }

    #[test]
    fn basic_select_where_limit_is_byte_exact() {
        let d = desc(
            r#"{"table":"meters","select":["ts","current"],"wheres":[{"column":"groupid","operator":"=","value":2}],"limit":10}"#,
        );
        let r = compile_select(&d, Dialect::Tdengine).unwrap();
        assert_eq!(r.sql, "SELECT `ts`, `current` FROM `meters` WHERE `groupid` = ? LIMIT 10");
        assert_eq!(r.params, vec![json!(2)]);
    }

    #[test]
    fn select_defaults_to_star() {
        let d = desc(r#"{"table":"meters"}"#);
        let r = compile_select(&d, Dialect::Tdengine).unwrap();
        assert_eq!(r.sql, "SELECT * FROM `meters`");
        assert!(r.params.is_empty());
    }

    #[test]
    fn multiple_wheres_and_or() {
        let d = desc(
            r#"{"table":"meters","select":["ts"],"wheres":[
                {"column":"groupid","operator":"=","value":1},
                {"column":"current","operator":">","value":10,"type":"and"},
                {"column":"phase","operator":"IS NOT NULL","value":null,"type":"or"}
            ]}"#,
        );
        let r = compile_select(&d, Dialect::Tdengine).unwrap();
        assert_eq!(
            r.sql,
            "SELECT `ts` FROM `meters` WHERE `groupid` = ? AND `current` > ? OR `phase` IS NOT NULL"
        );
        assert_eq!(r.params, vec![json!(1), json!(10)]);
    }

    #[test]
    fn where_in_expands_placeholders() {
        let d = desc(
            r#"{"table":"meters","select":["ts"],"wheres":[{"column":"groupid","operator":"IN","value":[1,2,3]}]}"#,
        );
        let r = compile_select(&d, Dialect::Tdengine).unwrap();
        assert_eq!(r.sql, "SELECT `ts` FROM `meters` WHERE `groupid` IN (?, ?, ?)");
        assert_eq!(r.params, vec![json!(1), json!(2), json!(3)]);
    }

    #[test]
    fn empty_select_array_falls_back_to_star() {
        let d = desc(r#"{"table":"meters","select":[]}"#);
        let r = compile_select(&d, Dialect::Tdengine).unwrap();
        assert_eq!(r.sql, "SELECT * FROM `meters`");
        assert!(r.params.is_empty());
    }

    #[test]
    fn scalar_operator_rejects_non_scalar_value() {
        let d = desc(
            r#"{"table":"meters","select":["ts"],"wheres":[{"column":"groupid","operator":"=","value":[1,2]}]}"#,
        );
        let err = compile_select(&d, Dialect::Tdengine).unwrap_err();
        assert!(err.contains("E_INVALID_WHERE_VALUE"), "got: {}", err);
    }

    #[test]
    fn scalar_operator_rejects_null_value() {
        let d = desc(
            r#"{"table":"meters","select":["ts"],"wheres":[{"column":"phase","operator":"=","value":null}]}"#,
        );
        let err = compile_select(&d, Dialect::Tdengine).unwrap_err();
        assert!(err.contains("E_INVALID_WHERE_VALUE"), "got: {}", err);
        assert!(err.contains("IS NULL"), "got: {}", err);
    }

    #[test]
    fn unknown_clause_type_is_rejected_not_coerced() {
        let d = desc(
            r#"{"table":"meters","select":["ts"],"wheres":[
                {"column":"a","operator":"=","value":1},
                {"column":"b","operator":"=","value":2,"type":"xor"}
            ]}"#,
        );
        let err = compile_select(&d, Dialect::Tdengine).unwrap_err();
        assert!(err.contains("E_INVALID_CLAUSE_TYPE"), "got: {}", err);
    }

    #[test]
    fn injection_in_column_is_rejected() {
        let d = desc(
            r#"{"table":"meters","select":["ts"],"wheres":[{"column":"g; DROP TABLE meters","operator":"=","value":1}]}"#,
        );
        assert!(compile_select(&d, Dialect::Tdengine).is_err());
    }

    #[test]
    fn injection_in_table_is_rejected() {
        let d = desc(r#"{"table":"meters`; DROP TABLE x","select":["ts"]}"#);
        assert!(compile_select(&d, Dialect::Tdengine).is_err());
    }

    #[test]
    fn time_window_clause_is_rejected_not_miscompiled() {
        let d = desc(r#"{"table":"meters","select":["ts"],"interval":"1m"}"#);
        let err = compile_select(&d, Dialect::Tdengine).unwrap_err();
        assert!(err.contains("58.5"), "got: {}", err);

        let d2 = desc(r#"{"table":"meters","select":["ts"],"partitionBy":["groupid"]}"#);
        assert!(compile_select(&d2, Dialect::Tdengine).is_err());
    }
}
