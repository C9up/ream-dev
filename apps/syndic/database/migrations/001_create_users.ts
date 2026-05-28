import { Migration } from '@c9up/atlas'

export default class CreateUsers extends Migration {
  up() {
    this.schema.createTable('users', (t) => {
      t.uuid('id').primary()
      t.string('email', 255).notNullable().unique()
      t.string('first_name', 100).notNullable()
      t.string('last_name', 100).notNullable()
      t.string('phone', 30).nullable()
      t.string('avatar_url', 500).nullable()
      t.string('password_hash', 255).notNullable()
      t.timestamps()
    })
  }

  down() {
    this.schema.dropTable('users')
  }
}
