// Notification System
// Part of ChiefSOS Ecosystem Manager

import type { EcosystemEnv } from './types';

/**
 * Send a message to Telegram
 * Requires TELEGRAM_BOT_TOKEN
 * Uses chat_id if provided, otherwise attempts to find it or log error
 */
export async function sendTelegramMessage(
    env: EcosystemEnv,
    text: string,
    chatId?: string
): Promise<{ success: boolean; error?: string }> {
    if (!env.TELEGRAM_BOT_TOKEN) {
        return { success: false, error: "TELEGRAM_BOT_TOKEN not set" };
    }

    const targetChatId = chatId || env.TELEGRAM_CHAT_ID;

    if (!targetChatId) {
        console.warn("[Telegram] No chat ID provided and no default TELEGRAM_CHAT_ID set");
        return { success: false, error: "No Chat ID available" };
    }

    try {
        const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: targetChatId,
                text: text,
                parse_mode: "Markdown"
            })
        });

        const data = await response.json() as { ok: boolean; description?: string };

        if (!data.ok) {
            console.error(`[Telegram] API Error: ${data.description}`);
            return { success: false, error: data.description };
        }

        return { success: true };

    } catch (error) {
        console.error("[Telegram] Network Error:", error);
        return { success: false, error: String(error) };
    }
}

/**
 * Send a message to Discord
 * Requires DISCORD_BOT_TOKEN
 */
export async function sendDiscordMessage(
    env: EcosystemEnv,
    text: string,
    channelId?: string
): Promise<{ success: boolean; error?: string }> {
    if (!env.DISCORD_BOT_TOKEN) {
        return { success: false, error: "DISCORD_BOT_TOKEN not set" };
    }

    if (!channelId) {
        return { success: false, error: "No Channel ID provided" };
    }

    try {
        const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                content: text
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Discord] API Error (${response.status}): ${errorText}`);
            return { success: false, error: `HTTP ${response.status}: ${errorText}` };
        }

        return { success: true };

    } catch (error) {
        console.error("[Discord] Network Error:", error);
        return { success: false, error: String(error) };
    }
}
