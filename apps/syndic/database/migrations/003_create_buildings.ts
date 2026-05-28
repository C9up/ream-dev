import { Migration } from '@c9up/atlas'

export default class CreateBuildings extends Migration {
  up() {
    this.schema.createTable('buildings', (t) => {
      t.uuid('id').primary()
      t.uuid('residence_id').notNullable().references('residences')
      t.string('name', 100).notNullable()
      t.string('entrance_code', 20).nullable()
      t.timestamp('created_at').notNullable().defaultTo('NOW()')
    })
  }

  down() {
    this.schema.dropTable('buildings')
  }
}
