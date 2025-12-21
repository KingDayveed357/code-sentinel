🚨 CodeSentinel — AI-Powered Security & Code Quality Scanner for GitHub Repos

Identify vulnerabilities. Enforce standards. Ship secure code — faster.

CodeSentinel is a developer-first security auditing platform that analyzes GitHub/GitLab repositories in real-time, detects vulnerabilities, and generates clear, actionable remediation steps using AI.
Designed for teams, startups, and enterprise engineering organizations that want to secure their codebase automatically.

📌 Table of Contents

Overview

Key Features

Architecture

Tech Stack

Repository Structure

Environment Variables

Installation

Development Workflow

Supabase Schema

API Routes

Security

Roadmap

License

🌐 Overview

CodeSentinel automates the entire code security process:

Connect your GitHub/GitLab repository

CodeSentinel scans the repo

AI analyzes findings and generates human-readable explanations

You get a dashboard showing vulnerabilities, severity levels, and fix instructions

Developers can act immediately or trigger follow-up scans

The goal is simple:
Make security accessible, automated, and effortless for every engineering team.

🚀 Key Features
🔍 1. Automated Repository Scanning

Static code analysis

AI-assisted vulnerability detection

Dependency analysis

Configurations/misconfigurations (env leaks, hardcoded secrets, misused APIs, etc.)

⚙️ 2. AI-Generated Fix Suggestions

Every issue comes with:

Explanation

Severity

Reproduction context

Step-by-step fix

🔗 3. GitHub & GitLab Integration

OAuth-based installation

Webhook-based event triggers

Automatic re-scans on new commits and PRs

🛡️ 4. Security Dashboard

Overview of repo health

Vulnerabilities grouped by severity

Historical scan results

Audit log

👥 5. Team & Permissions

Invite collaborators

Role-based access

Repo-level permissions

🏢 6. Enterprise Features (coming soon)

SSO (SAML)

Custom compliance reports (SOC2, ISO27001)

API access

Self-hosted scans

🧩 Architecture
                    GitHub/GitLab
                         |
                  Webhooks / API
                         |
                ┌──────────────────┐
                │    Fastify API   │
                │  (Typescript)    │
                └──────────────────┘
                         |
                 Authentication
                         |
                ┌──────────────────┐
                │     Supabase     │
                │  (Auth + DB)     │
                └──────────────────┘
                         |
                    Scan Engine
                         |
                  AI Analysis Layer
                         |
                ┌──────────────────┐
                │   Frontend App   │
                │  (Next.js 15)    │
                └──────────────────┘

Backend

Handles:

Repo ingestion

Job queue for scanners

GitHub webhooks

Authentication middlewares

Exposure of REST API for frontend

Frontend

Next.js app with dashboard, onboarding, docs, and analytics.

🛠️ Tech Stack
Frontend

Next.js (App Router)

TypeScript

Tailwind CSS

ShadCN

Zustand / React Query

Backend

Fastify

TypeScript

Fastify Plugins (CORS, JWT, Sensible, Rate Limit)

Database & Auth

Supabase (PostgreSQL + Row Level Security)

Supabase Auth (OAuth optional)

AI

OpenAI / Gemini for analysis & remediation suggestions


🧪 Development Workflow
1. Developer pushes code → GitHub repo
2. GitHub fires a webhook → CodeSentinel backend
3. Backend queues a scan
4. Scan engine analyzes the repo
5. AI generates explanations & fixes
6. Frontend dashboard displays results



🔐 Security

All backend routes protected via JWT

Supabase Row-Level Security (RLS) enabled

GitHub webhooks verified using signature

Token rotation

Strict Content Security Policy

No secrets in frontend env

📅 Roadmap
MVP

GitHub OAuth

Repo scanning

Vulnerability detection

Dashboard

AI fix suggestions

v1.0

Team accounts

PR comments & automated reviews

Scheduled scans

Email notifications

Enterprise

SSO (SAML)

Audit logs

Private cloud / self-hosted agents

📄 License

MIT License — free to modify and use in commercial projects.