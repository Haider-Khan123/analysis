# Analysis

🚀 LOVABLE PROMPT — FULL STACK PROJECT (PRODUCTION READY)

You are a Senior Full Stack Software Engineer + System Architect + DevOps Engineer.

Your task is to build a production-ready, scalable, secure, and maintainable SaaS web application named:

🏫 Project Name: ANALYSIS

🎯 PROJECT OVERVIEW

“Analysis” is a school communication and student management SaaS platform designed to replace fragmented systems like WhatsApp, paper diaries, Excel sheets, and manual attendance registers.

It provides a centralized digital system for:

 Schools

 Teachers

 Parents

 Administrators

The system improves:

 Communication

 Transparency

 Academic tracking

 Administrative efficiency

This is a multi-tenant SaaS application (future-ready architecture).

⚙️ CORE REQUIREMENTS (NON-NEGOTIABLE)

You must build this system with:

🧱 Architecture

 Full-stack modular architecture

 Clean separation of concerns

 Scalable backend design (service-oriented or modular monolith)

 API-first approach (REST or GraphQL)

 Secure authentication system

 Role-based access control (RBAC)

🧪 Code Quality

 Production-level code only

 Strict best practices (SOLID principles)

 Reusable components

 Clean folder structure

 No hardcoded values (use config files/env variables)

 Proper validation everywhere

 Error handling middleware

🔐 Security

 JWT-based authentication

 Password hashing (bcrypt/argon2)

 Role-based authorization

 Secure API routes

 Input sanitization

 Rate limiting (basic)

⚡ Performance

 Optimized DB queries

 Pagination for all lists

 Lazy loading where needed

 Minimal re-renders (frontend)

📱 PWA REQUIREMENT (MANDATORY)

The system must be PWA-ready from day one:

 Installable web app

 Service worker implementation

 Offline-friendly architecture (basic caching)

 Responsive design (mobile-first)

 App-like UI experience

🎨 UI DESIGN SYSTEM (STRICT COLORS)

Use the following color system globally across UI:

Primary Color: #2563EB (Blue - Actions, buttons, highlights)

Secondary Color: #22C55E (Success, positive states)

Accent Color: #F59E0B (Warnings, highlights, badges)

Background: #F8FAFC (Light background)

Text: #1E293B (Primary text color)

UI Requirements:

 Modern SaaS UI (clean, minimal, professional)

 Tailwind CSS or equivalent design system

 Consistent spacing and typography

 Fully responsive layouts

 Accessible design (ARIA compliant)

🧩 PHASE 1 SCOPE (ONLY THESE MODULES)

You will implement ONLY the following modules in Phase 1:

1️⃣ USER AUTHENTICATION MODULE

Features:

 Secure user registration

 Login / Logout system

 JWT authentication

 Role-based access control

Roles:

 Admin (School Admin)

 Teacher

 Parent

Requirements:

 Password encryption

 Session/token validation

 Protected routes per role

 Forgot/reset password (optional but recommended)

2️⃣ STUDENT ADMINISTRATION MODULE

Features:

🏫 School Structure

 School profile management

 Class & section creation

 Teacher management

 Student enrollment

👨‍🎓 Student Management

 Student profile creation

 Student records management

 Assign parents to students

 Student academic history storage

👨‍🏫 Teacher Management

 Add/edit/remove teachers

 Assign teachers to classes

🧑‍💼 Admin Controls

 Full CRUD for all entities

 Role-based access enforcement

🗄️ DATABASE DESIGN REQUIREMENTS

Design normalized relational schema including:

 Users

 Roles

 Schools

 Teachers

 Students

 Parents

 Classes

 Sections

 Assignments (relationships)

Ensure:

 Proper foreign keys

 Indexing for performance

 Data integrity constraints

🧠 BUSINESS LOGIC RULES

 A student must belong to only one class/section at a time

 A parent can be linked to multiple students

 Teachers can be assigned to multiple classes

 Admin has full access, others have restricted views

 All actions must be audited (basic logging recommended)

🧱 API REQUIREMENTS

Build clean REST APIs:

/auth/register

/auth/login

/users

/schools

/students

/teachers

/classes

/sections

Each API must include:

 Validation layer

 Error responses

 Authorization checks

📊 DASHBOARD (BASIC FOR PHASE 1)

Create role-based dashboards:

Admin Dashboard:

 Total students

 Total teachers

 Classes overview

 School summary

Teacher Dashboard:

 Assigned classes

 Student list

 Basic overview

Parent Dashboard:

 Assigned children

 Basic student profile view

🚫 EXCLUDED FROM PHASE 1 (IMPORTANT)

Do NOT implement:

 Attendance system

 Homework module

 Messaging/chat system

 Announcements

 Reporting dashboards (advanced)

 Payroll / HR / finance

 Mobile native apps

 AI features

 Video calls or communication tools

🧪 TESTING REQUIREMENTS

 Basic unit tests for core logic

 API testing readiness

 Input validation tests

 Authentication tests

🚀 DEPLOYMENT READINESS

Project must be:

 Environment-configurable

 Production build ready

 Docker-ready (optional but recommended)

 Deployment-ready on Vercel / AWS / Render / similar

🧾 FINAL OUTPUT EXPECTATION

Lovable must generate:

 Full-stack working application

 Clean folder structure

 Scalable architecture

 Secure authentication system

 Student administration system

 PWA-enabled frontend

 Production-grade codebase

 Well-documented code

⚠️ FINAL INSTRUCTION

Do NOT generate prototype or demo code.

This must be:

“A production-ready SaaS foundation that can be directly scaled into a commercial education platform

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://classflow-systems.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7f6edd18-00df-4aea-9676-3a355dd85b53).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
