import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateTicketsTable1764311000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'tickets',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'match_id',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'created_by_admin_id',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'assigned_to_admin_id',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'resolution_notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            isNullable: false,
            default: `'open'`,
          },
          {
            name: 'priority',
            type: 'varchar',
            length: '20',
            isNullable: false,
            default: `'medium'`,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKeys('tickets', [
      new TableForeignKey({
        columnNames: ['match_id'],
        referencedTableName: 'matches',
        referencedColumnNames: ['match_id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['created_by_admin_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        columnNames: ['assigned_to_admin_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
      }),
    ]);

    await queryRunner.createIndices('tickets', [
      new TableIndex({
        name: 'IDX_tickets_match_id',
        columnNames: ['match_id'],
      }),
      new TableIndex({
        name: 'IDX_tickets_status',
        columnNames: ['status'],
      }),
      new TableIndex({
        name: 'IDX_tickets_created_at',
        columnNames: ['created_at'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('tickets', 'IDX_tickets_match_id');
    await queryRunner.dropIndex('tickets', 'IDX_tickets_status');
    await queryRunner.dropIndex('tickets', 'IDX_tickets_created_at');
    await queryRunner.dropTable('tickets');
  }
}


