import { Migration } from '@c9up/atlas'

export default class CreateResidences extends Migration {
  up() {
    this.schema.createTable('residences', (t) => {
      t.uuid('id').primary()
      t.string('name', 255).notNullable()
      t.string('address', 500).notNullable()
      t.string('city', 100).notNullable()
      t.string('postal_code', 10).notNullable()
      t.string('photo', 500).nullable()
      t.timestamps()
    })
  }

  down() {
    this.schema.dropTable('residences')
  }
}
