# 🛠️ Bunch of Utils - VS Code Extension

<p align="center">
  <img src="icon.png" width="128" height="128" alt="Bunch of Utils Icon"/>
</p>

**Supercharge your development workflow with a comprehensive collection of productivity utilities!**

This powerful VS Code extension provides essential tools for developers working with text manipulation, testing, JSX/React development. Designed to save time and boost productivity across multiple programming languages and frameworks.

[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](https://github.com/saimageshvar/bunch-of-utils)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.94.0+-brightgreen.svg)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/license-MIT-orange.svg)](https://github.com/saimageshvar/bunch-of-utils)

---

## ✨ Features at a Glance

### 🎯 **Text Manipulation**
- Join selected text with custom operators
- Multiple cursor support  
- Configurable separators

### 🧪 **Testing Tools**
- Copy & run test line numbers
- Ruby & Cucumber support
- Auto-terminal execution

### ⚛️ **React/JSX**
- Transform props to template literals
- Multiple selections
- Batch transformations

### 📝 **Notes System**
- Save, view, and manage notes
- Open/delete notes from view
- Organized by creation date

---

## 🚀 Quick Start

### Installation
1. **From VS Code Marketplace**: Search for "Bunch of Utils" in the Extensions view
2. **From GitHub**: Clone and install locally for development

### Essential Commands
| Command | Keyboard Shortcut | Description |
|---------|------------------|-------------|
| **Join Text with Operator** | `Ctrl+Shift+J` | Join selected text with custom separator |
| **Save Untitled Note** | *(none)* | Save a new unsaved file to your notes directory |
| **Refresh Notes View** | *(none)* | Refresh the notes tree view |
| **Open Note** | *(none)* | Open a note from the notes view |
| **Delete Note** | *(none)* | Delete a note from the notes view |

---

## 📖 Feature Documentation

### 🎯 Text Manipulation

#### **Join Text with Operator**
Perfect for creating lists, parameters, or any delimited text from multiple selections.

**Commands Available:**
- `Join Text with Operator` - Uses your configured default operator
- `Join Text with Custom Operator` - Prompts for a one-time operator

**Example Workflow:**
```javascript
// Select these lines:
const firstName = 'John';
const lastName = 'Doe';
const age = 30;

// Result with '::' operator:
const firstName = 'John'::const lastName = 'Doe'::const age = 30;

// Common use cases:
// • Creating SQL column lists
// • Joining array elements
// • Building parameter strings
```

**✨ Features:**
- ✅ Multiple cursor support
- ✅ Automatic clipboard copy
- ✅ Configurable default operator
- ✅ Custom operator input
- ✅ Works with any text selection

---

### ⚛️ React/JSX Development

#### **Prop to Template Literal Transformer**
Effortlessly convert JSX props from string literals to template literals for dynamic content.

**Before:**
```jsx
<Component 
  title="Hello World"
  className="btn-primary"
  data-id="user-123"
/>
```

**After (using Prop to Template Literal):**
```jsx
<Component 
  title={`Hello World`}
  className={`btn-primary`}
  data-id={`user-123`}
/>
```

**✨ Features:**
- ✅ Batch transformation of multiple props
- ✅ Multiple selection support
- ✅ Preserves prop structure
- ✅ Handles both single and double quotes
- ✅ Perfect for internationalization prep

---

### 🧪 Testing Utilities

#### **Smart Test Line Numbers**
Streamline your testing workflow with intelligent test detection and execution.

**Supported Frameworks:**
- **Ruby Minitest**: Detects `def test_` methods
- **Cucumber**: Detects `Scenario:` blocks

**Commands:**
- `Copy Test Line Numbers` - Copies test file paths with line numbers
- `Run Selected Tests/Scenarios` - Automatically executes tests in terminal

**Example Output:**
```bash
# For Ruby tests:
spec/models/user_test.rb:15:42:78

# For Cucumber:
features/login.feature:12:25
```

**✨ Features:**
- ✅ Multi-cursor support for batch operations
- ✅ Automatic terminal integration
- ✅ Configurable test commands
- ✅ Smart test method detection
- ✅ Cross-platform compatibility

---

### 📝 Notes System

#### **Save and Organize Notes**
Easily save new unsaved files as notes, organize them by creation date, and manage them from a dedicated sidebar view.

**Commands Available:**
- `Save Untitled Note`: Save the current unsaved file to your notes directory
- `Refresh Notes View`: Refresh the notes list in the sidebar

**How it works:**
- Set your notes directory in the extension settings (`noteSaver.notesDirectory`).
- Use the `Save Untitled Note` command to save a new file. You can choose to append the current datetime and file extension automatically.
- View, open, and delete notes from the "Notes" activity bar panel, grouped by creation date.

**✨ Features:**
- ✅ Configurable notes directory
- ✅ Optionally append datetime and file extension
- ✅ Tree view grouped by creation date
- ✅ Open and delete notes from the sidebar

---

## ⚙️ Configuration

### 🎛️ Extension Settings

Access settings via `File > Preferences > Settings` and search for "Bunch of Utils":

#### **Text Manipulation**
```json
{
  "joinTextWithOperator.operator": "::"
}
```

#### **Testing Configuration**
```json
{
  "runSelectedTests.testFileCommand": "rails test",
  "runSelectedTests.featureFileCommand": "cucumber"
}
```

#### **Notes System**
```json
{
  "noteSaver.notesDirectory": "/path/to/your/notes",
  "noteSaver.appendDatetime": true,
  "noteSaver.appendExtension": true
}
```

### 📋 Configuration Options

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `joinTextWithOperator.operator` | string | `::` | Default operator for joining text |
| `runSelectedTests.testFileCommand` | string | `rails test` | Command for Ruby test files |
| `runSelectedTests.featureFileCommand` | string | `cucumber` | Command for Cucumber features |
| `noteSaver.notesDirectory` | string | `""` | Directory where notes are saved |
| `noteSaver.appendDatetime` | boolean | true | Append datetime to note filename |
| `noteSaver.appendExtension` | boolean | true | Append language extension to note filename |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Command | Context |
|----------|---------|---------|
| `Ctrl+Shift+J` | Join Text with Operator | Editor focused |

*All shortcuts are configurable via VS Code's Keyboard Shortcuts settings.*

---

## 🎯 Use Cases & Workflows

### **For React Developers**
- Transform static props to dynamic template literals
- Prepare components for internationalization
- Batch convert prop formats during refactoring

### **For Test-Driven Development**
- Quickly run specific test methods
- Copy test paths for CI/CD configurations
- Navigate between test files efficiently

### **For DevOps & Backend Developers**
- Join configuration parameters
- Create delimiter-separated value lists
- Generate deployment scripts

### **For Note-Taking and Organization**
- Quickly save scratch notes, meeting minutes, or code snippets
- Organize notes by creation date
- Access and manage notes from a dedicated sidebar

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Setup
```bash
git clone https://github.com/saimageshvar/bunch-of-utils.git
cd bunch-of-utils
npm install
code .
# Press F5 to run the extension in development mode
```

---

## 📈 Changelog

### **v3.0.0** - Latest Release
- ✅ **NEW**: Comprehensive work tracking system
- ✅ **NEW**: Multiple log formats (text, JSON, CSV)
- ✅ **NEW**: Auto-start capability
- ✅ **ENHANCED**: Better error handling
- ✅ **ENHANCED**: Improved extension lifecycle

### **v2.3.0** - Previous Release
- ✅ Text manipulation utilities
- ✅ JSX prop transformation
- ✅ Test line number utilities

---

## 📄 License

This project is licensed under the MIT License

---

## 🌟 Support & Feedback

- **⭐ Star this repository** if you find it useful!
- **🐛 Report issues** on [GitHub Issues](https://github.com/saimageshvar/bunch-of-utils/issues)
- **💡 Suggest features** via GitHub Discussions
- **📧 Contact**: [Your Contact Information]

---

<p align="center">
  <strong>Made with ❤️ for the VS Code community</strong><br>
  <em>Boost your productivity, one utility at a time!</em>
</p>