/**
 * Browser coverage for category OR matching, publisher filtering, combined criteria,
 * and restoring the catalog with the clear-filters control.
 *
 * @packageDocumentation
 */
import { test, expect } from '@playwright/test';

test.describe('Game filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows games from any selected category', async ({ page }) => {
    const categoryFilters = page.locator('input[name="category"]');
    const visibleCards = page.locator('[data-testid="game-card"]:visible');

    expect(await categoryFilters.count()).toBeGreaterThanOrEqual(2);

    const firstFilter = categoryFilters.nth(0);
    const secondFilter = categoryFilters.nth(1);
    await firstFilter.check();
    const firstCategoryCount = await visibleCards.count();
    await firstFilter.uncheck();

    await secondFilter.check();
    const secondCategoryCount = await visibleCards.count();
    await firstFilter.check();

    await expect(visibleCards).toHaveCount(firstCategoryCount + secondCategoryCount);
    await expect(page.getByTestId('game-filter-status')).toHaveText(
      `Showing ${firstCategoryCount + secondCategoryCount} of ${await page.getByTestId('game-card').count()} games.`,
    );
  });

  test('filters by publisher and can clear the selection', async ({ page }) => {
    const firstCard = page.getByTestId('game-card').first();
    const publisherId = await firstCard.getAttribute('data-game-publisher-id');
    if (publisherId === null) throw new Error('Expected game card to include its publisher id');

    const expectedCount = await page.locator(
      `[data-testid="game-card"][data-game-publisher-id="${publisherId}"]`,
    ).count();
    const publisherFilter = page.getByTestId('publisher-filter');
    await publisherFilter.selectOption(publisherId);

    const visibleCards = page.locator('[data-testid="game-card"]:visible');
    await expect(visibleCards).toHaveCount(expectedCount);
    await expect(firstCard).toBeVisible();

    await page.getByTestId('clear-game-filters').click();
    await expect(visibleCards).toHaveCount(await page.getByTestId('game-card').count());
    await expect(publisherFilter).toHaveValue('');
  });

  test('combines category and publisher filters', async ({ page }) => {
    const firstCard = page.getByTestId('game-card').first();
    const categoryId = await firstCard.getAttribute('data-game-category-id');
    const publisherId = await firstCard.getAttribute('data-game-publisher-id');
    if (categoryId === null || publisherId === null) {
      throw new Error('Expected game card to include category and publisher ids');
    }

    const categoryFilter = page.locator(
      `input[name="category"][value="${categoryId}"]`,
    );
    const publisherFilter = page.getByTestId('publisher-filter');
    const visibleCards = page.locator('[data-testid="game-card"]:visible');

    await categoryFilter.check();
    await publisherFilter.selectOption(publisherId);

    const matchingCards = page.locator(
      `[data-testid="game-card"][data-game-category-id="${categoryId}"][data-game-publisher-id="${publisherId}"]`,
    );
    await expect(visibleCards).toHaveCount(await matchingCards.count());
    await expect(firstCard).toBeVisible();
    await expect(page.getByTestId('game-filter-status')).toContainText(
      `Showing ${await matchingCards.count()} of`,
    );
    await expect(matchingCards).not.toHaveCount(0);

    await page.getByTestId('clear-game-filters').click();
    await expect(visibleCards).toHaveCount(await page.getByTestId('game-card').count());
    await expect(categoryFilter).not.toBeChecked();
    await expect(publisherFilter).toHaveValue('');
  });

  test('shows an empty state when no games match and restores results when cleared', async ({ page }) => {
    const publisherFilter = page.getByRole('combobox', { name: 'Publisher' });
    const visibleCards = page.locator('[data-testid="game-card"]:visible');
    const allCards = page.getByTestId('game-card');
    const emptyMessage = page.getByTestId('game-filter-empty');

    // Add a deterministic, page-local option that cannot match any seeded card.
    await publisherFilter.evaluate((select) => {
      (select as HTMLSelectElement).add(
        new Option('No matching games (test fixture)', 'test-no-matching-games'),
      );
    });
    await publisherFilter.selectOption('test-no-matching-games');

    await expect(visibleCards).toHaveCount(0);
    await expect(emptyMessage).toBeVisible();
    await expect(emptyMessage).toHaveText('No games match those filters.');
    await expect(page.getByRole('status')).toHaveText(
      `Showing 0 of ${await allCards.count()} games.`,
    );

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(visibleCards).toHaveCount(await allCards.count());
    await expect(emptyMessage).toBeHidden();
    await expect(publisherFilter).toHaveValue('');
  });

  test('supports keyboard use and visible focus on category controls', async ({ page }) => {
    const categoryFilter = page.getByRole('checkbox', { name: 'Action' });

    await categoryFilter.focus();
    await expect(categoryFilter).toBeFocused();

    const hasVisibleFocus = await categoryFilter.evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return (
        (styles.outline !== 'none' && styles.outlineWidth !== '0px') ||
        styles.boxShadow !== 'none'
      );
    });
    expect(hasVisibleFocus).toBeTruthy();

    await page.keyboard.press('Space');
    await expect(categoryFilter).toBeChecked();
    await expect(page.getByRole('status')).toContainText('Showing ');
    await page.keyboard.press('Space');
    await expect(categoryFilter).not.toBeChecked();
  });
});
