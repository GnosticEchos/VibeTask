# Locale Template Usage

This directory contains translation files for the Kanban Frontend UI.

## How to Add a New Language

1. **Copy the template:**
   - Duplicate `xx.json` and rename it to your language code (e.g., `fr.json` for French, `de.json` for German).
2. **Fill in translations:**
   - Replace each empty string with the correct translation for your language.
   - Do not remove any keys. If a translation is not available, leave the value as an empty string for now.
3. **Test your translations:**
   - Switch your app's language setting to your new language code and verify all UI strings appear correctly.
4. **Contribute:**
   - If you want to contribute your translation, submit a pull request with your new file.

## Notes
- Keep the structure and keys identical to the template to ensure compatibility.
- If new UI features are added, update all locale files to include new keys. 