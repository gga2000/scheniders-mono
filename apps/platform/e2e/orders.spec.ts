import { test, expect } from '@playwright/test';

test.describe('App Smoke Test', () => {

    test('should redirect to login when accessing protected route', async ({ page }) => {
        // Attempt to go to orders
        await page.goto('/orders');

        // Should be redirected to login
        await expect(page).toHaveTitle(/Login/);
        await expect(page).toHaveURL(/\/login/);

        // Verify Login UI
        await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
        await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
        await expect(page.getByPlaceholder('••••••••')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    });

    test('should show validation error on invalid login', async ({ page }) => {
        await page.goto('/login');

        // Fill invalid credentials
        await page.getByPlaceholder('you@example.com').fill('test@example.com');
        await page.getByPlaceholder('••••••••').fill('wrongpassword');

        // Wait for form validation to enable the button
        await page.waitForTimeout(500);

        await page.getByRole('button', { name: 'Sign In' }).click();

        // Expect error message (adjust text based on actual app response)
        // The app shows "Invalid login credentials" or similar
        await expect(page.getByText('Invalid login credentials').or(page.getByText('Invalid email or password'))).toBeVisible();
    });
});
