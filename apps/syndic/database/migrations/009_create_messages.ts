import { Migration } from '@c9up/atlas'

export default class CreateMessages extends Migration {
  up() {
    this.schema.createTable('messages', (t) => {
      t.uuid('id').primary()
      t.uuid('residence_id').notNullable().references('residences')
      t.uuid('author_id').notNullable().references('users')
      t.string('channel', 20).notNullable().defaultTo("'global'")
      t.uuid('task_id').nullable().references('tasks')
      t.uuid('recipient_id').nullable().references('users')
      t.text('body').notNullable()
      t.string('attachment_url', 500).nullable()
      t.timestamp('created_at').notNullable().defaultTo('NOW()')
    })
  }

  down() {
    this.schema.dropTable('messages')
  }
}
