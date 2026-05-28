import { Migration } from '@c9up/atlas'

export default class CreateUnits extends Migration {
  up() {
    this.schema.createTable('units', (t) => {
      t.uuid('id').primary()
      t.uuid('building_id').notNullable().references('buildings')
      t.string('number', 20).notNullable()
      t.integer('floor').nullable()
      t.integer('tantiemes').nullable()
      t.timestamp('created_at').notNullable().defaultTo('NOW()')
    })
  }

  down() {
    this.schema.dropTable('units')
  }
}
