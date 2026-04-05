from telegram import ReplyKeyboardMarkup, KeyboardButton
from telegram.ext import Application, CommandHandler, MessageHandler, filters
from config import BOT_TOKEN, PCS_AVAILABLE

async def start(update, context):
    keyboard = [[KeyboardButton(pc) for pc in PCS_AVAILABLE]]
    reply_markup = ReplyKeyboardMarkup(keyboard, one_time_keyboard=True, resize_keyboard=True)
    await update.message.reply_text(
        '¡Hola! Selecciona una PC para interactuar:',
        reply_markup=reply_markup
    )

async def select_pc(update, context):
    selected_pc = update.message.text
    if selected_pc in PCS_AVAILABLE:
        context.user_data['current_pc'] = selected_pc
        await update.message.reply_text(f'Has seleccionado: {selected_pc}. ¿Qué comando quieres enviar?')
    else:
        await update.message.reply_text('PC no válida. Por favor, selecciona una de la lista.')

def main():
    application = Application.builder().token(BOT_TOKEN).build()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, select_pc))

    application.run_polling()

if __name__ == '__main__':
    main()