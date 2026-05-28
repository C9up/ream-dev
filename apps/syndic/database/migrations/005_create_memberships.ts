import { Migration } from '@c9up/atlas'

export default class CreateMemberships extends Migration {
  up() {
    this.schema.createTable('memberships', (t) => {
      t.uuid('id').primary()
      t.uuid('user_id').notNullable().references('users')
      t.uuid('residence_id').notNullable().references('residences')
      t.uuid('unit_id').nullable().references('units')
      t.string('role', 30).notNullable()
      t.boolean('is_active').notNullable().defaultTo('true')
      t.timestamp('joined_at').notNullable().defaultTo('NOW()')
      t.timestamp('left_at').nullable()
      t.index('user_id')
      t.index('residence_id')
      t.index(['user_id', 'residence_id'])
    })
  }

  down() {
    this.schema.dropTable('memberships')
  }
}
