import { Migration } from '@c9up/atlas'

export default class CreateTasks extends Migration {
  up() {
    this.schema.createTable('tasks', (t) => {
      t.uuid('id').primary()
      t.uuid('residence_id').notNullable().references('residences')
      t.uuid('building_id').nullable().references('buildings')
      t.uuid('unit_id').nullable().references('units')
      t.uuid('declarant_id').notNullable().references('users')
      t.string('title', 200).notNullable()
      t.text('description').notNullable()
      t.string('status', 30).notNullable().defaultTo("'declared'")
      t.string('visibility', 30).notNullable().defaultTo("'public'")
      t.string('urgency', 20).notNullable().defaultTo("'medium'")
      t.uuid('assigned_syndic_id').nullable().references('users')
      t.string('category', 100).nullable()
      t.timestamps()
      t.timestamp('closed_at').nullable()
    })
  }

  down() {
    this.schema.dropTable('tasks')
  }
}
