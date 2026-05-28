import { Migration } from '@c9up/atlas'

export default class CreateQuotes extends Migration {
  up() {
    this.schema.createTable('quotes', (t) => {
      t.uuid('id').primary()
      t.uuid('task_id').notNullable().references('tasks')
      t.uuid('uploaded_by_id').notNullable().references('users')
      t.string('provider_name', 200).notNullable()
      t.decimal('amount', 10, 2).notNullable()
      t.string('status', 20).notNullable().defaultTo("'pending'")
      t.string('document_url', 500).nullable()
      t.timestamp('created_at').notNullable().defaultTo('NOW()')
    })
  }

  down() {
    this.schema.dropTable('quotes')
  }
}
