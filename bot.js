require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { ethers } = require('ethers');
const http = require('http');

const bot = new Telegraf(process.env.BOT_TOKEN);
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const EXPLORER_URL = process.env.EXPLORER_URL;

const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;
let adminWallet;
if (ADMIN_PRIVATE_KEY) {
    adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
}

const users = {};
const faucetCooldowns = {};
const FAUCET_AMOUNT = "5.0";
const COOLDOWN_MINUTES = 60;

const getWallet = (userId) => {
    if (!users[userId]) return null;
    return new ethers.Wallet(users[userId], provider);
};

bot.telegram.setMyCommands([
    { command: 'start', description: 'Create or view your wallet' },
    { command: 'balance', description: 'Check your USDC balance' },
    { command: 'send', description: 'Send tokens' },
    { command: 'receive', description: 'Show your address QR code' },
    { command: 'faucet', description: 'Get free testnet tokens' },
    { command: 'roadmap', description: 'See upcoming features' }
]);

bot.command('start', (ctx) => {
    const userId = ctx.from.id;
    if (!users[userId]) {
        const wallet = ethers.Wallet.createRandom();
        users[userId] = wallet.privateKey;
        ctx.reply(
            `*Arc Testnet Bot*\n\nAddress: \`${wallet.address}\`\nPrivate Key: \`${wallet.privateKey}\``,
            { parse_mode: 'Markdown' }
        );
    } else {
        const wallet = getWallet(userId);
        ctx.reply(`Address: \`${wallet.address}\``, { parse_mode: 'Markdown' });
    }
});

bot.command('balance', async (ctx) => {
    const userId = ctx.from.id;
    const wallet = getWallet(userId);
    if (!wallet) return ctx.reply("Use /start first");

    try {
        const balance = await provider.getBalance(wallet.address);
        ctx.reply(`Balance: ${ethers.formatEther(balance)} USDC`);
    } catch (e) {
        ctx.reply(`Error: ${e.message}`);
    }
});

bot.command('faucet', async (ctx) => {
    if (!adminWallet) {
         return ctx.reply(
            "Claim Arc Testnet USDC here:",
            Markup.inlineKeyboard([
                Markup.button.url('Open Circle Faucet', 'https://faucet.circle.com/')
            ])
        );
    }

    const userId = ctx.from.id;
    const wallet = getWallet(userId);
    if (!wallet) return ctx.reply("Use /start first");

    const lastClaim = faucetCooldowns[userId] || 0;
    const now = Date.now();
    const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;

    if (now - lastClaim < cooldownMs) {
        const remaining = Math.ceil((cooldownMs - (now - lastClaim)) / 60000);
        return ctx.reply(`⏳ Cooldown active. Wait ${remaining} minutes.`);
    }

    try {
        ctx.reply("🚰 Dispensing 5.0 USDC...");
        const tx = await adminWallet.sendTransaction({
            to: wallet.address,
            value: ethers.parseEther(FAUCET_AMOUNT)
        });
        faucetCooldowns[userId] = now;
        ctx.reply(
            `✅ *Claim Successful!*\n\nSent: ${FAUCET_AMOUNT} USDC\nHash: \`${tx.hash}\`\n[View on Explorer](${EXPLORER_URL}/tx/${tx.hash})`,
            { parse_mode: 'Markdown', disable_web_page_preview: true }
        );
    } catch (e) {
        console.error(e);
        ctx.reply("⚠️ Faucet error or empty treasury. Using link instead:", 
            Markup.inlineKeyboard([Markup.button.url('Open Official Faucet', 'https://faucet.circle.com/')])
        );
    }
});

bot.command('receive', (ctx) => {
    const userId = ctx.from.id;
    if (!users[userId]) return ctx.reply("Use /start first");

    const address = getWallet(userId).address;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${address}`;

    ctx.replyWithPhoto(qrUrl, { 
        caption: `Your Address:\n\`${address}\``, 
        parse_mode: 'Markdown' 
    });
});

bot.command('send', async (ctx) => {
    const userId = ctx.from.id;
    const wallet = getWallet(userId);
    if (!wallet) return ctx.reply("Use /start first");

    const args = ctx.message.text.split(' ');
    if (args.length !== 3) return ctx.reply("Usage: /send <address> <amount>");

    const to = args[1];
    const amount = args[2];

    if (!ethers.isAddress(to)) return ctx.reply("Invalid address");

    try {
        ctx.reply("Sending transaction...");
        const tx = await wallet.sendTransaction({
            to: to,
            value: ethers.parseEther(amount)
        });
        
        ctx.reply(
            `Sent!\nHash: \`${tx.hash}\`\n[View on Explorer](${EXPLORER_URL}/tx/${tx.hash})`,
            { parse_mode: 'Markdown', disable_web_page_preview: true }
        );
    } catch (e) {
        ctx.reply(`Failed: ${e.message}`);
    }
});

bot.command('roadmap', (ctx) => {
    ctx.reply(
        `*🚀 Project Roadmap*\n\n` +
        `✅ *Phase 1 (Live):* Wallet generation, Sending/Receiving USDC, Faucet.\n\n` +
        `🔄 *Phase 2 (In Progress):* \n` +
        `• *Trading:* Swap USDC/EURC directly in chat.\n` +
        `• *Bridge:* Move assets from Ethereum via Circle CCTP.\n\n` +
        `Stay tuned for updates!`,
        { parse_mode: 'Markdown' }
    );
});

bot.launch().then(() => {
    console.log("✅ Bot is online!");
});

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.write('Bot is running');
    res.end();
}).listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));