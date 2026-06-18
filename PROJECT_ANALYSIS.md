# NutritionAI Project - Comprehensive Analysis

## Project Overview
**NutritionAI** is a nutritional management web application built with modern Next.js 16 stack. It's designed to help nutritionists manage work groups, patients, and track nutritional data.

---

## Tech Stack

### Frontend
- **Framework**: Next.js 16 (App Router)
- **UI**: React 19.2 + Tailwind CSS v4
- **Styling**: Tailwind CSS with design tokens (OKLCH color system)
- **Components**: Custom components + Lucide React icons
- **Font**: Geist (Sans & Mono)

### Backend & Database
- **Auth**: NextAuth v5 (Credentials provider with JWT)
- **Database**: PostgreSQL (Neon)
- **ORM**: Drizzle ORM v0.44.7
- **Password Hashing**: bcrypt v6

### Development Tools
- **Package Manager**: npm (package-lock.json)
- **Linting**: ESLint v9
- **TypeScript**: v5 (strict mode)
- **File Upload**: Vercel Blob v2

---

## Database Schema

### Users Table (`users`)
```
- id: UUID (PK, auto-generated)
- email: text (UNIQUE, NOT NULL)
- password: text (NOT NULL - hashed with bcrypt)
- createdAt: timestamp (default: now)
```
Note: Users can only log in via email/password through admin panel.

### Work Groups Table (`work_groups`)
```
- id: serial (PK)
- name: varchar(255) (NOT NULL)
- status: varchar(50) (default: "Activo")
- logoUrl: text (optional)
- createdAt: timestamp (default: now)
```

### Genders Table (`genders`)
```
- id: serial (PK)
- name: varchar(50) (UNIQUE, NOT NULL)
- createdAt: timestamp (default: now)
```

### Sports Table (`sports`)
```
- id: serial (PK)
- name: varchar(120) (UNIQUE, NOT NULL)
- createdAt: timestamp (default: now)
```

### Patients Table (`patients`)
```
- id: serial (PK)
- document: varchar(60) (UNIQUE - RUT/DNI/Passport, NOT NULL)
- firstName: varchar(120) (NOT NULL)
- lastName: varchar(120) (NOT NULL)
- birthDate: date (NOT NULL)
- phone: varchar(30) (optional)
- email: text (UNIQUE, NOT NULL)
- genderId: integer (FK → genders.id, NOT NULL)
- workGroupId: integer (FK → work_groups.id, NOT NULL)
- sportId: integer (FK → sports.id, optional)
- createdAt: timestamp (default: now)
- updatedAt: timestamp (default: now)
```

---

## Project Structure

```
app/
├── layout.tsx                 # Root layout with fonts + AuthSessionProvider
├── globals.css               # Design system (colors, fonts, themes)
├── page.tsx                  # Home (redirects to /dashboard or /login)
├── login/
│   └── page.tsx             # Login form (email/password)
├── register/
│   └── page.tsx             # User registration
├── api/
│   ├── auth/[...nextauth]/  # NextAuth handlers
│   └── register/            # Registration endpoint
├── dashboard/
│   ├── layout.tsx           # Dashboard layout (Sidebar + Topbar)
│   ├── page.tsx             # Dashboard home
│   ├── Sidebar.tsx          # Navigation menu (client component)
│   ├── Topbar.tsx           # Top bar with user menu
│   ├── groups/
│   │   ├── page.tsx         # Work groups management
│   │   └── actions.ts       # Server actions for groups
│   ├── patients/
│   │   ├── page.tsx         # Patients management
│   │   ├── actions.ts       # Server actions for patients
│   │   └── components/
│   │       ├── AddPatientModal.tsx
│   │       └── EditPatientModal.tsx
│   └── antropometria/       # Anthropometry routes (placeholder)
├── SessionProvider.tsx       # Auth session context provider
auth.ts                       # NextAuth configuration
components/
├── ImageDropzone.tsx         # Image upload component
└── logout-button.tsx         # Logout button
lib/
├── db.ts                     # Database connection (Drizzle)
└── utils.ts                  # Utility functions
drizzle/
├── schema.ts                 # Database schema definitions
└── migrations/              # Database migration files
```

---

## Design System

### Color Scheme (OKLCH)
**Light Mode:**
- Background: White (`oklch(1 0 0)`)
- Foreground: Dark Gray (`oklch(0.141 0.005 285.823)`)
- Primary: Dark Purple (`oklch(0.21 0.006 285.885)`)
- Secondary: Light Gray (`oklch(0.967 0.001 286.375)`)
- Accent: Same as Secondary
- Destructive: Red/Orange (`oklch(0.577 0.245 27.325)`)

**Dark Mode:**
- Background: Dark Gray (`oklch(0.141 0.005 285.823)`)
- Foreground: White (`oklch(0.985 0 0)`)
- Primary: Light Gray (`oklch(0.92 0.004 286.32)`)
- Secondary: Medium Gray (`oklch(0.274 0.006 286.033)`)

**Sidebar:**
- Background: Slate-900 (dark blue-gray)
- Text: Slate-50 (off-white)
- Active State: Slate-800 (slightly lighter)

### Typography
- **Sans Font**: Geist (primary for body text)
- **Mono Font**: Geist Mono (for code)
- **Line Height**: Using Tailwind's standard (leading-relaxed for body)

### Spacing & Radius
- **Radius**: 0.625rem (10px) base radius with variants (-sm, -md, -lg, -xl)
- **Spacing**: Standard Tailwind scale (4px, 8px, 16px, etc.)

---

## Key Features & Pages

### 1. Authentication
- **Login Page** (`/login`)
  - Email/password form
  - Client-side form handling
  - Error messages for invalid credentials
  
- **Register Page** (`/register`)
  - User account creation
  - Password hashing with bcrypt

### 2. Dashboard (`/dashboard/*`)
- **Sidebar Navigation**
  - Grupos (Work Groups)
  - Pacientes (Patients)
  - Antropometría (expandable submenu)
  - Nutrición (expandable submenu)
  - Icons for each section (emojis)
  
- **Topbar**
  - User menu
  - Logout button

- **Patients Management** (`/dashboard/patients`)
  - Table view with all patient data
  - Add/Edit/Delete modals
  - Linked to work groups, genders, and sports
  - Search/filter (basic table display)

- **Work Groups Management** (`/dashboard/groups`)
  - CRUD operations for groups
  - Status tracking (Activo/Inactivo)

- **Placeholders** (Not yet implemented)
  - Anthropometry routes
  - Nutrition routes

---

## Current Limitations & Gaps

1. **Incomplete Routes**
   - `/dashboard/antropometria/puntosdecorte`
   - `/dashboard/antropometria/bicompartimental`
   - `/dashboard/antropometria/tetracompartimental`
   - `/dashboard/antropometria/pentacompartimental`
   - `/dashboard/alimentacion/alimentacion`
   - `/dashboard/alimentacion/hidratacion`

2. **UI/UX Improvements Needed**
   - Dashboard homepage is minimal
   - No charts/visualizations for nutritional data
   - No export/reporting features
   - Mobile responsiveness could be enhanced

3. **Features Not Implemented**
   - Patient history/timeline
   - Nutritional assessment forms
   - Workout tracking
   - Food database/meal planning
   - Progress charts
   - Email notifications

4. **Missing UI Refinements**
   - No loading states in modals
   - No toast notifications
   - Limited form validation
   - No pagination on tables (will break with large datasets)

---

## Authentication Flow

1. User navigates to `/` → redirects to `/login` or `/dashboard` based on session
2. Login form submits credentials to NextAuth
3. NextAuth validates against `users` table with bcrypt comparison
4. Session created with JWT token
5. User can access `/dashboard/*` routes
6. Logout clears session

---

## File Upload Integration
- **Vercel Blob**: Integrated for potential image uploads
- **ImageDropzone**: Component exists but needs implementation details

---

## Next Steps & Recommendations

### Immediate Improvements
1. Implement anthropometry measurement forms
2. Add nutritional assessment pages
3. Create patient progress/history timeline
4. Add dashboard widgets/charts

### Medium-term Enhancements
1. Patient document upload (medical history, reports)
2. Export patient data to PDF/Excel
3. Advanced filtering and search
4. Meal planning features
5. Workout tracking

### Long-term Features
1. Mobile app
2. Real-time notifications
3. Third-party integrations (health apps, wearables)
4. AI-powered nutrition recommendations
5. Video consultation integration

---

## Design Preferences Observed
- **Color Palette**: Professional blues/purples with good contrast
- **Layout**: Sidebar navigation + main content area
- **Tables**: Classic table design with clear headers and row actions
- **Forms**: Modal-based for CRUD operations
- **Typography**: Clean, readable sans-serif font

---

## Notes
- Project uses modern Next.js 16 features (App Router, Server Components)
- Strong security foundation (bcrypt hashing, JWT, CSRF protection)
- Database schema is well-normalized
- Ready for feature expansion
