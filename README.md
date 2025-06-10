
# 🛠️ Bunch of Utils - VS Code Extension

<p align="center">
  <img src="icon.png" width="128" height="128" alt="Bunch of Utils Icon"/>
</p>

**Supercharge your development workflow with a comprehensive collection of productivity utilities!**

This powerful VS Code extension provides essential tools for developers working with text manipulation, testing, JSX/React development, and work activity tracking. Designed to save time and boost productivity across multiple programming languages and frameworks.

[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](https://github.com/saimageshvar/bunch-of-utils)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.94.0+-brightgreen.svg)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/license-MIT-orange.svg)](https://github.com/saimageshvar/bunch-of-utils)

---

## ✨ Features at a Glance

| 🎯 **Text Manipulation** | 🧪 **Testing Tools** | ⚛️ **React/JSX** | 📊 **Work Tracking** |
|:------------------------:|:--------------------:|:----------------:|:--------------------:|
| Join selected text with custom operators | Copy & run test line numbers | Transform props to template literals | Track git branches & active files |
| Multiple cursor support | Ruby & Cucumber support | Multiple selections | Multiple log formats |
| Configurable separators | Auto-terminal execution | Batch transformations | Auto-start capability |

---

## 🚀 Quick Start

### Installation
1. **From VS Code Marketplace**: Search for "Bunch of Utils" in the Extensions view
2. **From GitHub**: Clone and install locally for development

### Essential Commands
| Command | Keyboard Shortcut | Description |
|---------|------------------|-------------|
| **Join Text with Operator** | `Ctrl+Shift+J` | Join selected text with custom separator |
| **Start Work Tracking** | `Ctrl+Shift+W` | Begin activity tracking |
| **Stop Work Tracking** | `Ctrl+Shift+S` | End activity tracking |

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

### 📊 Work Activity Tracking

#### **Comprehensive Work Analytics**
Monitor your development activity with detailed logging and multiple export formats.

**What Gets Tracked:**
- 🌿 **Git Branch**: Current working branch
- 📁 **Active File**: Currently focused file with line/column
- ⏰ **Timestamps**: Both ISO and local formats
- 🏢 **Workspace**: Current project context

**Log Formats:**
| Format | Extension | Use Case |
|--------|-----------|----------|
| **Text** | `.txt` | Human-readable logs |
| **JSON Lines** | `.jsonl` | Data analysis & processing |
| **CSV** | `.csv` | Spreadsheet import & analysis |

**Example Output:**

**Text Format:**
```
[6/9/2025, 2:30:15 PM]
  Branch: feature/user-authentication
  Active File: src/auth/login.js (Line: 42, Col: 18)
  Workspace: my-awesome-project
```

**JSON Lines Format:**
```json
{"timestamp":"2025-06-09T14:30:15.123Z","branch":"feature/user-authentication","fileName":"src/auth/login.js","line":42,"column":18,"workspace":"my-awesome-project"}
```

**CSV Format:**
```csv
timestamp,branch,fileName,line,column,workspace
2025-06-09T14:30:15.123Z,feature/user-authentication,src/auth/login.js,42,18,my-awesome-project
```

**Commands:**
- `Start Work Tracking` - Begin activity monitoring
- `Stop Work Tracking` - End monitoring session
- `Work Tracking Status` - View current tracking state
- `Open Work Log` - View generated logs

**✨ Features:**
- ✅ Configurable tracking intervals (default: 5 minutes)
- ✅ Auto-start on extension activation
- ✅ Multiple export formats
- ✅ Custom log file paths
- ✅ Selective tracking options
- ✅ Git integration
- ✅ Workspace detection

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

#### **Work Tracking Settings**
```json
{
  "workTracker.trackingInterval": 300,
  "workTracker.logFilePath": "",
  "workTracker.trackBranch": true,
  "workTracker.trackActiveFile": true,
  "workTracker.autoStart": false,
  "workTracker.logFormat": "text"
}
```

### 📋 Configuration Options

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `joinTextWithOperator.operator` | string | `::` | Default operator for joining text |
| `runSelectedTests.testFileCommand` | string | `rails test` | Command for Ruby test files |
| `runSelectedTests.featureFileCommand` | string | `cucumber` | Command for Cucumber features |
| `workTracker.trackingInterval` | number | 300 | Tracking interval in seconds |
| `workTracker.logFilePath` | string | `""` | Custom log file path |
| `workTracker.trackBranch` | boolean | true | Enable git branch tracking |
| `workTracker.trackActiveFile` | boolean | true | Enable active file tracking |
| `workTracker.autoStart` | boolean | false | Auto-start tracking on activation |
| `workTracker.logFormat` | enum | `text` | Log format: text, json, or csv |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Command | Context |
|----------|---------|---------|
| `Ctrl+Shift+J` | Join Text with Operator | Editor focused |
| `Ctrl+Shift+W` | Start Work Tracking | When tracking inactive |
| `Ctrl+Shift+S` | Stop Work Tracking | When tracking active |

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

### **For Project Managers & Freelancers**
- Track time spent in different files/branches
- Generate work activity reports
- Monitor development patterns and productivity

### **For DevOps & Backend Developers**
- Join configuration parameters
- Create delimiter-separated value lists
- Generate deployment scripts

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