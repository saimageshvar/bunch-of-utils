
# Bunch of Utils - VS Code Extension

This Visual Studio Code extension provides a set of utilities to enhance your development workflow. It includes commands to join selected text with a customizable operator and to transform JSX/HTML-like properties into template literals.

## Features

- **Join selected text** at multiple cursor positions with a user-defined operator.
- **Copy the joined text** directly to your clipboard for easy pasting.
- **Customizable operator**: Set your own operator in the VS Code settings, or fall back to the default (`::`).
- **Transform JSX/HTML-like properties** from `propName="value"` format into `propName={value}` format.

## Usage

### Join Text with Operator
#### Commands
- Join Text with Operator
- Join Text with Custom Operator

1. **Select multiple pieces of text** in your editor (either with multiple cursors or by selecting text across multiple lines).
2. **Run the command** using:
   - **Keyboard shortcut**: Press `Ctrl + Shift + J` to join the text with the default or custom operator.
   - **Command Palette**: Open the Command Palette (`Ctrl + Shift + P`) and search for "Join Text with Operator".

The selected text will be joined with your specified operator (or `::` if no operator is defined) and automatically copied to your clipboard.

#### Example

If you have selected:

```
foo
bar
baz
```

And you are using the default `::` operator, the result will be:

```
foo::bar::baz
```

This result will be copied to your clipboard for easy use.

### Transform JSX/HTML-like Properties
#### Command: Prop to Template Literal

This VS Code extension allows you to transform JSX/HTML-like properties from `propName="value"` format into `propName={value}` format. It works for multiple selections and handles multiple props within a single selection, making it ideal for React developers who need to refactor JSX attributes into template literals.

- **Transform Any Property**: Automatically convert any prop with string values from **propName="value"** to **propName={\`value\`}**.
- This is specifically useful when you are changing your string type prop value to interpolated text
- **Multiple Selections**: Works with multiple selections at the same time.
- **Multiple Props in a Block**: Transforms all matching props within the selected block.

## Configuration

You can customize the operator used to join the text via the VS Code settings.

1. Open your VS Code `settings.json` file.
2. Add or modify the `joinTextWithOperator.operator` setting to your desired operator.

For example:

```json
{
  "joinTextWithOperator.operator": "&&"
}
```

This will join your selected text with `&&` instead of the default `::`.

## Installation

1. Clone or download this repository.
2. Open the folder in Visual Studio Code.
3. Press `F5` to run and debug the extension.
4. You can also publish it to the VS Code Marketplace if desired.

## Keyboard Shortcuts

The default keybinding is:

- **Ctrl + Shift + J**: Joins the selected text with the defined operator and copies it to the clipboard.

## Contributing

Feel free to submit issues and pull requests for additional features or improvements.