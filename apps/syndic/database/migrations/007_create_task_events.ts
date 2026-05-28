import { Migration } from '@c9up/atlas'

export default class CreateTaskEvents extends Migration {
  up() {
    this.schema.createTable('task_events', (t) => {
      t.uuid('id').primary()
      t.uuid('task_id').notNullable().references('tasks')
      t.uuid('actor_id').notNullable().references('users')
      t.string('event_type', 50).notNullable()
      t.text('data').nullable()
      t.text('comment').nullable()
      t.timestamp('created_at').notNullable().defaultTo('NOW()')
    })
  }

  down() {
    this.schema.dropTable('task_events')
  }
}
