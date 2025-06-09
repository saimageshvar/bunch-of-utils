# Change Log

All notable changes to the "bunch-of-utils" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [3.0.0] - 2025-06-09

### Added
- **Work Tracking System**: Comprehensive work activity tracking functionality
  - Track git branches and active files at regular intervals
  - Configurable tracking intervals (default: 5 minutes)
  - Multiple log formats: text, JSON Lines (.jsonl), and CSV
  - Auto-start option for automatic tracking on extension activation
  - Commands: Start/Stop Work Tracking, Open Work Log, Work Tracking Status
  - Keyboard shortcuts: Ctrl+Shift+W (start), Ctrl+Shift+S (stop)
  - Logs saved to `.vscode/work-log.*` in workspace by default
  
### Enhanced
- Improved extension description and categorization
- Better error handling and user feedback
- Cleaner extension lifecycle management

### Technical
- Added multiple new configuration options for work tracker
- Enhanced logging with structured data collection
- Improved command registration and state management

## [2.3.0] - Previous Release

### Features
- Join selected text with customizable operators
- Copy and run test line numbers for Ruby and Cucumber
- Transform JSX/HTML properties to template literals
- Text manipulation utilities

## [Unreleased]

- Initial release