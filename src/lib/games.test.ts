import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getGameById,
    getAllCategories,
    getAllPublishers,
    getFilteredGames,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

/**
 * Seeds distinct category/publisher combinations for filtering and option-ordering tests.
 *
 * @param db - Fresh in-memory database to populate.
 * @returns Relation IDs for selecting matching and non-matching filter combinations.
 */
async function seedFilterGames(db: Database): Promise<{
    actionId: number;
    puzzleId: number;
    strategyId: number;
    firstPublisherId: number;
}> {
    const categoryRows = await db
        .insert(categories)
        .values([
            { name: 'Strategy', description: 'strategy games' },
            { name: 'Puzzle', description: 'puzzle games' },
            { name: 'Action', description: 'action games' },
        ])
        .returning({ id: categories.id, name: categories.name });
    const publisherRows = await db
        .insert(publishers)
        .values([
            { name: 'First Publisher', description: 'first publisher' },
            { name: 'Second Publisher', description: 'second publisher' },
        ])
        .returning({ id: publishers.id, name: publishers.name });
    /**
     * Resolves a seeded category by name.
     *
     * @throws Error if the requested category is missing from the fixture.
     */
    const categoryId = (name: string): number => {
        const category = categoryRows.find((row) => row.name === name);
        if (!category) throw new Error(`Missing category fixture: ${name}`);
        return category.id;
    };
    /**
     * Resolves a seeded publisher by name.
     *
     * @throws Error if the requested publisher is missing from the fixture.
     */
    const publisherId = (name: string): number => {
        const publisher = publisherRows.find((row) => row.name === name);
        if (!publisher) throw new Error(`Missing publisher fixture: ${name}`);
        return publisher.id;
    };

    await db.insert(games).values([
        {
            title: 'Alpha Strategy',
            description: 'A strategy game',
            categoryId: categoryId('Strategy'),
            publisherId: publisherId('First Publisher'),
        },
        {
            title: 'Beta Puzzle',
            description: 'A puzzle game',
            categoryId: categoryId('Puzzle'),
            publisherId: publisherId('First Publisher'),
        },
        {
            title: 'Gamma Action',
            description: 'An action game',
            categoryId: categoryId('Action'),
            publisherId: publisherId('Second Publisher'),
        },
    ]);

    return {
        actionId: categoryId('Action'),
        puzzleId: categoryId('Puzzle'),
        strategyId: categoryId('Strategy'),
        firstPublisherId: publisherId('First Publisher'),
    };
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });

    it('returns games matching any selected category, ordered by title', async () => {
        const { strategyId, puzzleId } = await seedFilterGames(db);

        const filtered = await getFilteredGames(db, {
            categoryIds: [strategyId, puzzleId],
        });

        expect(filtered.map((game) => game.title)).toEqual(['Alpha Strategy', 'Beta Puzzle']);
    });

    it('filters by publisher and combines publisher with selected categories', async () => {
        const { puzzleId, strategyId, firstPublisherId } = await seedFilterGames(db);

        const byPublisher = await getFilteredGames(db, { publisherId: firstPublisherId });
        const combined = await getFilteredGames(db, {
            categoryIds: [puzzleId, strategyId],
            publisherId: firstPublisherId,
        });

        expect(byPublisher.map((game) => game.title)).toEqual(['Alpha Strategy', 'Beta Puzzle']);
        expect(combined.map((game) => game.title)).toEqual(['Alpha Strategy', 'Beta Puzzle']);
    });

    it('returns no games when the selected filters have no matching game', async () => {
        const { actionId, firstPublisherId } = await seedFilterGames(db);

        const filtered = await getFilteredGames(db, {
            categoryIds: [actionId],
            publisherId: firstPublisherId,
        });

        expect(filtered).toEqual([]);
    });

    it('returns all games when no filters are selected', async () => {
        await seedGames(db, 2);

        expect((await getFilteredGames(db, {})).map((game) => game.title)).toEqual([
            'Game 01',
            'Game 02',
        ]);
    });

    it('returns no games or filter options for an empty database', async () => {
        expect(await getFilteredGames(db, {})).toEqual([]);
        expect(await getAllCategories(db)).toEqual([]);
        expect(await getAllPublishers(db)).toEqual([]);
    });

    it('returns category and publisher filter options alphabetically', async () => {
        await seedFilterGames(db);

        expect((await getAllCategories(db)).map((category) => category.name)).toEqual([
            'Action',
            'Puzzle',
            'Strategy',
        ]);
        expect((await getAllPublishers(db)).map((publisher) => publisher.name)).toEqual([
            'First Publisher',
            'Second Publisher',
        ]);
    });
});
