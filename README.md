# notebug

> A mindful, full-stack note-taking web application with rich-text editing, Google Keep-style pinning, smart archiving, 15-day retention bin, built-in OCR text extraction, and PDF export.

---

## Key Features

- **Rich Text Editor**: Full styling support (Bold, Italic, Underline), custom typography (Inter, Arial, Georgia, Verdana), and flexible font sizing.
- **Google Keep-Style Pinning**: Anchor high-priority notes to the top of your workspace, automatically organized into **PINNED** and **OTHERS** sections.
- **Smart Archive**: Tuck away completed or reference notes to declutter your main board, with instant unarchiving whenever needed.
- **15-Day Retention Bin**: Deleted notes are safely stored in the Bin for 15 days with live countdown badges. Restore notes anytime or empty the bin permanently.
- **OCR Text Extraction**: Extract text directly from screenshots, photos, and document scans into your open note using client-side Tesseract.js.
- **Clean PDF Export**: Generate print-ready, formatted PDF documents from any note with one click.
- **User Profile & Stats**: Interactive profile popup showing account age, member-since date, and total notes created across active, archived, and bin categories.
- **Bug Reporting**: In-app bug report system in Settings to report issues directly to the team.
- **Earthy Theme Palette**: Custom light and dark themes inspired by natural forest greens, warm terracotta, sage, and parchment tones.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tiptap Editor, Lucide Icons, Tesseract.js
- **Backend**: Java 21, Spring Boot, Spring Security (JWT Authentication), Spring Data JPA
- **Database**: PostgreSQL (`notes_app`)

---

## Getting Started

### Prerequisites
- **Java 21+** (JDK)
- **Node.js 18+** & **npm**
- **PostgreSQL** running locally on port `5432` with a database named `notes_app`

### 1. Database Setup
Ensure PostgreSQL is running and create the database:
```sql
CREATE DATABASE notes_app;
```

### 2. Start the Backend
Open a terminal and run:
```powershell
cd backend
.\mvnw.cmd spring-boot:run
```
*(Backend runs on `http://localhost:8080`)*

### 3. Start the Frontend
In a second terminal window, run:
```powershell
cd frontend
npm install
npm run dev
```
*(Frontend runs on `http://localhost:5173`)*

Open **`http://localhost:5173`** in your browser to start using **notebug**.

---

## Project Structure

```text
notes app/
├── backend/
│   ├── src/main/java/com/notesapp/
│   │   ├── config/          # Security & CORS configuration
│   │   ├── controller/      # Auth, Notes, and Feedback REST endpoints
│   │   ├── dto/             # Request & Response models
│   │   ├── entity/          # User, Note, and Feedback JPA entities
│   │   ├── repository/      # Spring Data repositories (with 15-day bin queries)
│   │   └── security/        # JWT filter and token service
│   └── src/main/resources/  # application.properties
└── frontend/
    ├── src/
    │   ├── App.tsx          # Main application, editor, modals, and state
    │   ├── index.css        # Earthy theme tokens, layouts, and component styles
    │   └── main.tsx         # React entry point
    └── index.html           # App HTML entry
```
