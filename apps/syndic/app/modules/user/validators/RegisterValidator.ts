import { rules, schema } from "@c9up/rune";

export interface RegisterData {
	email: string;
	password: string;
	firstName: string;
	lastName: string;
	phone?: string;
}

export interface LoginData {
	email: string;
	password: string;
}

export const RegisterValidator = schema<RegisterData>({
	email: rules.string().email().trim(),
	password: rules.string().min(8).max(128),
	firstName: rules.string().min(1).max(100).trim(),
	lastName: rules.string().min(1).max(100).trim(),
	phone: rules.string().optional(),
});

export const LoginValidator = schema<LoginData>({
	email: rules.string().email().trim(),
	password: rules.string().min(1),
});
