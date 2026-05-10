# Teacher Salary Tracker Project Plan

## 1. Project Goal

Build a privacy-first web app for teachers to record lessons and calculate salary statistics.

The app will be deployed on Cloudflare and maintained through GitHub. Cloudflare will pull or deploy code from the GitHub repository.

Primary users:

- Teachers who record lessons, fees, hours, and view salary statistics.
- Admin user who manages accounts and login-page notices, but cannot view teachers' lesson details or salary data.
- Teachers who need light academic administration features: students, classes, schedules, attendance, leave, and makeup lessons.
- Teachers who teach across multiple campuses and need reminders for today's lessons, class content, homework, and next-lesson follow-up.

Core principle:

> Teacher lesson data and salary data must be encrypted before being stored. The admin dashboard and database must not expose plaintext lesson details.

## 2. Recommended Stack

- Language: TypeScript
- Frontend: React or Vue
- Styling: Tailwind CSS or a lightweight component system
- Charts: ECharts or Recharts
- Backend: Cloudflare Workers or Cloudflare Pages Functions
- Database: Cloudflare D1
- Optional cache/config storage: Cloudflare KV
- Deployment: GitHub repository connected to Cloudflare

TypeScript is preferred because it fits Cloudflare Workers, frontend development, API code, and build tooling well.

## 2.1 UI Direction

The approved UI direction is quiet, simple, and work-focused.

Visual rules:

- Use low-key gray/white surfaces with restrained accent colors.
- Prefer rectangular layouts with small natural rounded corners.
- Avoid bright green/yellow combinations and loud color themes.
- Avoid decorative complexity, oversized marketing-style hero sections, and unnecessary visual noise.
- Keep the app dense enough for repeated daily use, but not crowded.
- Make forms fast to use, because teachers may enter several past lessons at once.

Layout rules:

- Left sidebar contains the main navigation and can be collapsed/expanded by clicking the app name or collapse control.
- Important privacy reminders should stay visible near the bottom-left area of the interface.
- System notices should be shown near the top-right area after login, and also be visible on the login page before login.
- Login-page notices should wrap naturally and split at sentence boundaries instead of appearing as one long line.
- Top-right notices must stay inside their notice box and support two-line wrapping.
- Sidebar collapse/expand should feel smooth, including the bottom-left privacy reminder.
- Admin screens should look like operational tools, not promotional pages.
- Tables and schedules should prioritize scanning, filtering, and quick editing.

## 3. Deployment And Repository Notes

The project should be written with GitHub + Cloudflare deployment in mind.

Rules for future implementation:

- Do not commit secrets, API tokens, database files, or local environment files.
- Use environment variables and Cloudflare bindings for D1/KV.
- Keep configuration files clean and reproducible.
- Include a `.gitignore` before adding generated files.
- Use migration files for D1 schema changes.
- Keep frontend and backend code in predictable folders.
- Make the app deployable from a clean GitHub checkout.

Expected repository shape:

```text
/
  src/
    frontend/
    worker-or-functions/
    shared/
  migrations/
  docs/
  package.json
  wrangler.toml
  README.md
  PROJECT_PLAN.md
```

The exact structure can be adjusted after choosing React/Vue and Workers/Pages, but the deployment should remain simple.

## 4. Privacy Model

The app uses one shared D1 database, not one database per teacher.

Reason:

- Cloudflare free D1 database count is limited.
- The expected teacher count is around 10 to 20.
- One database with user-level isolation is simpler and more scalable.

Important distinction:

- Application-level permissions prevent teachers from seeing each other's records.
- Client-side encryption prevents the admin from seeing teachers' lesson details and salary data.

The admin should only see:

- Total registered users
- Account list
- Account status
- Created time / last login time if needed
- Whether the user has encrypted data
- Login-page notice settings

The admin should not see:

- Course names
- Student names
- Lesson notes
- Lesson fees
- Hours
- Monthly salary
- Yearly salary
- Detailed lesson count by date, if avoidable

## 4.1 Product Scope

This app should support both salary tracking and light educational operations.

Core objects:

- Teacher account
- Campus
- Student
- Course or teaching group
- One-on-one course
- Class course with multiple students
- Schedule rule
- Scheduled lesson
- Actual lesson record
- Attendance status
- Makeup lesson
- Salary rule
- Monthly salary summary
- Lesson content record
- Homework assignment
- Next-lesson reminder

The system should let teachers record lessons late. A teacher must be able to add, edit, or confirm a lesson for any previous date if they forgot to record it on the day of class.

The app should not force every lesson to be manually typed from scratch. Regular students/classes should be schedulable so the teacher can generate or confirm repeated lessons efficiently.

The app should help teachers prepare for today's lessons by showing upcoming lessons, campus/location, previous homework, and any next-lesson reminders.

## 4.2 Course Types

Two course types are required.

One-on-one:

- Usually one student.
- Fee can be calculated by hourly rate or fixed lesson rate.
- Attendance is simple: attended, leave, absent, cancelled, or makeup.

Class course:

- Multiple students belong to one class/course group.
- Teacher salary for a class lesson can include:
  - base lesson fee
  - per-present-student head fee
  - optional adjustment
- Example:
  - base fee: 80
  - per-present-student fee: 10
  - 4 students expected, 3 attended
  - salary amount: 80 + 3 * 10 = 110

Class course attendance must record expected students and actual attendance separately, because missing students affect salary and may create later makeup lessons.

## 4.2.1 Campus Management

The system should support multiple campuses/teaching locations.

Campus requirements:

- A teacher can create and manage campus names.
- A student can be associated with a default campus.
- A course or class can be associated with a default campus.
- A scheduled lesson can inherit the default campus but still allow manual override.
- Today's lesson reminder should show the campus/location clearly.

Campus information is sensitive because it reveals teaching location and schedule. It should be stored inside encrypted user data.

## 4.3 Attendance And Special Cases

Every scheduled or actual lesson should support attendance states.

Suggested states:

- scheduled
- completed
- attended
- leave_requested
- absent
- cancelled
- makeup_pending
- makeup_completed

For class courses, attendance is per student:

```text
Class lesson
- expected students: A, B, C, D
- attended: A, B, D
- leave/absent: C
- salary: base fee + attended count * head fee
- C can be linked to a later makeup lesson
```

For one-on-one courses, attendance is usually lesson-level, but should still support leave, absence, cancellation, and makeup.

All attendance and makeup operations must remain connected to salary calculation. A record should not be only a visual schedule item; it should be able to become or update a salary-affecting lesson record.

## 4.4 Scheduling

Scheduling should reduce repeated manual entry.

Required scheduling abilities:

- Add a student and define regular lesson times.
- Add a class/course group and define regular lesson times.
- Support multiple schedule rules for the same student or class.
- Support irregular/ad-hoc lessons.
- Support backfilling lessons for previous dates.
- Generate draft scheduled lessons for a selected date range or month.
- Generate draft scheduled lessons by selecting a start date, end date, and selected weekdays.
- Allow manual scheduling by clicking a calendar date after selecting student/class, start time, and end time.
- Let the teacher confirm, edit, cancel, or mark attendance for generated lessons.
- Show today's scheduled lessons as reminders.
- Show campus/location in lesson reminders.
- Let reminders include previous homework or next-lesson preparation notes.

Examples:

```text
Student A:
- Day 1, 08:00-10:00
- Day 2, 16:00-18:00
```

```text
Student B:
- Every Wednesday, 19:00-21:00
```

```text
Class C:
- Every Saturday, 09:00-11:00
- Students: A, B, C, D
- Fee rule: base 80 + 10 per attended student
```

Schedule rules should be encrypted because they reveal student/course information and class habits.

## 4.4.1 Today's Lesson Reminders

The app should provide a clear "today's lessons" reminder area.

Reminder requirements:

- Show today's upcoming and completed lessons.
- Sort by start time.
- Show student/class name, course subject, time range, campus, and status.
- Highlight lessons that need confirmation after class.
- Show previous homework or preparation notes when available.
- Let the teacher quickly mark completed, leave, absent, cancelled, or makeup needed.
- Let the teacher open the lesson record directly from the reminder.

Because the data is encrypted, reminder generation happens in the browser after decrypting schedule and lesson documents.

## 4.4.2 Calendar Overview

The app should include a calendar overview.

Calendar overview requirements:

- Show all scheduled and completed lessons on calendar days.
- Show day-level status such as completed, pending confirmation, leave, absence, or makeup pending.
- Show daily lesson count and daily salary amount when available.
- Let the teacher click a date to see day details.
- Provide daily, weekly, and monthly summaries near the calendar.
- Use the calendar for both review and scheduling workflows where practical.

## 4.5 Makeup Lessons

Makeup lessons should be first-class records, not only notes.

Makeup lesson requirements:

- A makeup lesson can link back to the original missed lesson.
- A makeup lesson can involve one student from a class course.
- A class-course makeup lesson should be able to use the per-student/head-fee rule instead of the normal one-on-one fee.
- A makeup lesson can have a custom fee adjustment when needed.
- The teacher should be able to mark the original lesson as makeup_pending and later makeup_completed.

Example:

```text
Original class lesson:
- base fee 80
- head fee 10
- Student C absent
- Original salary excludes Student C head fee

Later makeup:
- Student C receives makeup lesson
- Salary uses class head fee, custom makeup fee, or configured makeup policy
```

The first version should keep the fee rule configurable but not overly complex.

## 4.5.1 Lesson Content And Homework

Each completed lesson should support teaching content and homework records.

Lesson content fields:

- What was taught in this lesson.
- Student performance or class notes.
- Problems or knowledge points to review.
- Homework assigned after class.
- Optional internal note.

Homework and next-lesson follow-up:

- When a teacher records homework for the current lesson, the app should be able to carry it into the next scheduled lesson as a reminder.
- The next lesson should show a "previous homework to check" section.
- The carried-over homework must be editable, because real teaching plans may change.
- If the next lesson is rescheduled, the reminder should follow the linked next lesson where practical.
- For class courses, homework can be class-level, and later versions may support per-student homework notes if needed.

Suggested behavior:

```text
Lesson 1 completed:
- content: Linear equations
- homework: Finish worksheet pages 3-4

Next lesson reminder:
- Check previous homework: Finish worksheet pages 3-4
- Suggested content: Review wrong problems from worksheet
- Teacher can edit before or during Lesson 2
```

These records are sensitive and must be encrypted.

## 4.6 Salary Formula

Teacher salary should support:

- Monthly base salary
- One-on-one lesson fees
- Class lesson base fees
- Class lesson per-attended-student fees
- Makeup lesson fees
- Manual adjustments

Monthly salary formula:

```text
monthly salary =
  base salary
  + confirmed one-on-one lesson fees
  + confirmed class lesson fees
  + confirmed makeup lesson fees
  + manual adjustments
```

Only confirmed/completed records should count toward salary by default. Draft scheduled lessons should not affect salary until confirmed.

Fee rules should live in encrypted user data because they reveal private salary arrangements.

## 5. Login And Encryption Design

Use a simple teacher login flow:

```text
username + login password
```

The login password is also the data password from the teacher's perspective. The teacher only needs to remember one password.

Internally, the frontend derives separate keys from the same password:

```text
login verifier key -> used for login verification
data encryption key -> used for lesson data encryption/decryption
```

The raw password must not be stored.

The backend should never receive or store a key that can decrypt lesson data.

Suggested model:

1. User enters username and password in the browser.
2. Browser uses a key derivation function to derive:
   - a login proof/verifier value
   - a data encryption key or key-encryption key
3. Backend verifies login without learning the plaintext lesson data key.
4. Browser decrypts lesson data locally after login.

Implementation detail can be refined later. For the first implementation, Web Crypto API with PBKDF2 + AES-GCM is acceptable. If a well-maintained Argon2id browser package is added later, it can improve password-hardening.

Registration flow:

- First-time users should register before login.
- Registration asks for username, password, and password confirmation.
- Password fields should have a show/hide visibility button.
- After successful registration, the user returns to the login screen and logs in.

Admin role setup:

- Users must not be able to choose "admin" during normal registration.
- In local demo mode, the first registered account can be treated as admin for testing.
- In production, admin status should be controlled by the D1 `users.role` field or by a protected initialization script/command.
- Admin assignment must not depend on a public UI control.

## 6. Recovery Code

Teachers should not manage multiple daily passwords.

Use only:

- Username
- Login/data password
- Recovery code for emergencies

The recovery code is generated during registration and shown once. The teacher must save it.

Recovery code purpose:

- Reset the login/data password if the teacher forgets it.
- Re-encrypt the user's data key with a new password.

Important rule:

If the teacher forgets the password and loses the recovery code, encrypted lesson data cannot be recovered.

This limitation should be clearly shown during registration.

## 7. Data Storage Strategy

Prefer storing encrypted documents instead of many plaintext operational rows.

Reason:

- Students, courses, schedules, attendance, fee rules, and notes are all sensitive.
- Admin should not be able to inspect teacher salary details or course details from D1.
- The expected data volume is small enough for browser-side decryption and calculation.

Use D1 for account metadata, encrypted payload storage, and admin-visible settings.

Example tables:

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_verifier TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  encrypted_data_key_by_password TEXT NOT NULL,
  encrypted_data_key_by_recovery TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE encrypted_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  doc_key TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, doc_type, doc_key)
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Suggested encrypted document types:

```text
profile               teacher salary settings, base salary, preferences
campuses              campus/location list
students              student list and student notes
course_groups         one-on-one courses and class courses
schedule_rules        recurring schedule rules
lesson_month          one user's actual/scheduled lessons for a month
salary_adjustments    monthly manual additions/deductions
lesson_followups      cross-lesson homework and next-lesson reminder links
```

`doc_key` examples:

```text
profile/default
campuses/default
students/default
course_groups/default
schedule_rules/default
lesson_month/2026-05
salary_adjustments/2026-05
lesson_followups/default
```

The backend may know that a user has a `lesson_month` document for `2026-05`, but it must not know the student names, course names, attendance details, or salary values inside it.

Plaintext payload before encryption:

```json
{
  "students": [
    {
      "id": "student-a",
      "name": "Student A",
      "defaultCampusId": "campus-1",
      "note": ""
    }
  ],
  "campuses": [
    {
      "id": "campus-1",
      "name": "Main Campus",
      "address": "",
      "note": ""
    }
  ],
  "courseGroups": [
    {
      "id": "course-1",
      "name": "Math Class",
      "type": "class",
      "defaultCampusId": "campus-1",
      "studentIds": ["student-a", "student-b"],
      "feeRule": {
        "baseFee": 80,
        "perPresentStudentFee": 10,
        "makeupFeeMode": "perStudentFee"
      }
    }
  ],
  "lessons": [
    {
      "id": "lesson-id",
      "date": "2026-05-10",
      "startTime": "08:00",
      "endTime": "10:00",
      "courseGroupId": "course-1",
      "campusId": "campus-1",
      "type": "class",
      "status": "completed",
      "expectedStudentIds": ["student-a", "student-b"],
      "attendance": [
        { "studentId": "student-a", "status": "attended" },
        { "studentId": "student-b", "status": "leave_requested" }
      ],
      "feeSnapshot": {
        "baseFee": 80,
        "perPresentStudentFee": 10,
        "amount": 90
      },
      "lessonContent": {
        "taught": "Linear equations",
        "homework": "Finish worksheet pages 3-4",
        "nextLessonReminder": "Check worksheet mistakes first",
        "internalNote": ""
      },
      "linkedOriginalLessonId": null,
      "note": ""
    }
  ]
}
```

Stored in D1:

```text
doc_type = lesson_month
doc_key = 2026-05
encrypted_payload = ciphertext
```

This lets the backend fetch encrypted documents by user and key without seeing lesson details.

Fee snapshots should be saved on confirmed lesson records. This protects historical salary calculations if the teacher later changes a course fee rule.

## 8. Statistics

Because lesson details and amounts are encrypted, salary statistics should be calculated in the browser after decryption.

Teacher-side statistics:

- Daily total
- Weekly total
- Monthly salary
- Monthly lesson count
- Monthly hours
- Yearly salary trend
- Yearly lesson count trend
- One-on-one income
- Class-course income
- Makeup lesson income
- Attendance summary
- Leave/absence summary
- Base salary plus lesson-fee breakdown
- Course/student breakdown if needed

Teacher-side reminders:

- Today's lessons
- Campus/location for each lesson
- Lessons requiring completion confirmation
- Previous homework to check
- Next-lesson preparation notes
- Makeup lessons pending arrangement

Admin-side statistics:

- Registered teacher count
- Active account count
- Disabled account count
- Optional: number of users who have saved encrypted data
- Optional: app-level usage status without course/salary details

Admin-side statistics must not require decrypting teacher data.

## 9. Main Features

Teacher features:

- Register account
- Login with username and password
- Save recovery code during registration
- Manage students
- Manage campuses
- Manage one-on-one courses
- Manage class courses and class student lists
- Configure base salary
- Configure course fee rules
- Configure recurring schedule rules
- View today's lesson reminders
- View calendar overview with daily, weekly, and monthly information
- Generate draft scheduled lessons
- Confirm scheduled lessons as completed
- Add lesson
- Backfill lessons for previous dates
- Edit lesson
- Delete lesson
- Mark attendance, leave, absence, cancellation, and makeup status
- Link makeup lessons to original missed lessons
- Record lesson content
- Record homework
- Carry homework into the next lesson reminder
- Manually adjust next-lesson reminder content
- View day/week/month/year statistics
- View salary breakdown by base salary, one-on-one, class, makeup, and adjustments
- View charts
- Export own decrypted data to CSV/Excel
- Change password using current password
- Reset password using recovery code
- Delete own account after password confirmation

Admin features:

- Login as admin
- View total registered users
- View user list
- Enable/disable user account
- Initiate or perform user deletion depending on final policy
- Edit login-page system notice
- Publish top-right in-app notice
- View app settings

Admin must not have a screen for viewing teacher lesson details.

## 10. User Deletion Policy

Preferred policy:

- Teacher can delete their own account after entering the login/data password again.
- Admin can disable an account.
- Admin can delete an account only after strong confirmation, but deletion should only remove encrypted data and account records. It must not reveal data.

Recommended first version:

```text
Admin disable account: supported
Teacher self-delete: supported
Admin permanent delete: optional, protected by confirmation
```

If admin permanent delete is added, the UI should clearly say that this deletes encrypted data permanently and cannot be undone.

Do not ask the teacher to give their password to the admin.

## 11. Login-Page System Notice

Add a public login-page notice that the admin can edit.

Behavior:

- Login page loads the current notice before login.
- If enabled, the notice appears near the top-right area on the login page.
- After login, the notice remains available near the top-right area of the app shell.
- Users can read it before logging in.
- Admin can edit the notice from the admin dashboard.

Suggested setting:

```json
{
  "enabled": true,
  "title": "System Notice",
  "content": "Notice content written by admin.",
  "updatedAt": "2026-05-10T00:00:00.000Z"
}
```

Security:

- Store notice as plain text or safe Markdown.
- Do not allow raw HTML or scripts.

## 12. API Draft

Public:

```text
GET  /api/public/login-notice
POST /api/auth/register
POST /api/auth/login
POST /api/auth/recover-password
```

Teacher:

```text
GET    /api/me
GET    /api/encrypted-documents/:docType/:docKey
PUT    /api/encrypted-documents/:docType/:docKey
DELETE /api/me
POST   /api/me/change-password
```

Most teacher operations happen after local decryption:

```text
student management
course/class management
schedule rule editing
draft lesson generation
attendance marking
salary calculation
export
```

The backend stores and returns encrypted documents only.

Admin:

```text
GET    /api/admin/summary
GET    /api/admin/users
PATCH  /api/admin/users/:id/status
DELETE /api/admin/users/:id
GET    /api/admin/login-notice
PUT    /api/admin/login-notice
```

All teacher APIs must verify the authenticated user and only access that user's data.

## 13. Security Rules

- Never store plaintext lesson data in D1.
- Never log plaintext lesson data on the server.
- Never send decrypted lesson data to admin APIs.
- Never ask a teacher to share their password with admin.
- Never store plaintext student names, class names, schedule rules, attendance details, or salary fee rules.
- Keep only minimal metadata outside encrypted payloads.
- Use HTTPS only, which Cloudflare provides.
- Use secure session cookies or signed tokens.
- Validate all API input.
- Add rate limiting or basic abuse protection for login attempts.
- Keep admin role assignment controlled and not self-service.
- Make backup/export behavior explicit.

## 14. Known Tradeoffs

Client-side encryption improves privacy but affects some features.

Limitations:

- Admin cannot help recover data if password and recovery code are both lost.
- Server cannot calculate teacher salary statistics directly.
- Global salary analytics are not available.
- Search across encrypted fields must happen after local decryption.
- Schedule generation and attendance summaries happen in the browser after decrypting teacher data.
- Admin cannot inspect or correct a teacher's course fee rules.
- If a teacher changes fee rules, historical confirmed lessons need saved fee snapshots to remain stable.
- Data migration must carefully preserve encryption compatibility.

For this project's expected size, these tradeoffs are acceptable.

## 15. Implementation Phases

Phase 1: Project foundation

- Create TypeScript Cloudflare project.
- Add GitHub-ready structure.
- Add `.gitignore`, README, and deployment notes.
- Configure D1 binding.
- Create initial migrations.

Phase 2: Authentication and encryption

- Implement username/password registration.
- Generate recovery code.
- Implement key derivation and AES-GCM helpers.
- Implement login/session handling.
- Store only encrypted data keys and verifiers.

Phase 3: Teacher data model and lesson management

- Add encrypted document storage.
- Add student management.
- Add campus management.
- Add one-on-one course management.
- Add class course management.
- Add salary rule settings.
- Add lesson create/edit/delete UI.
- Add backfill support for previous dates.
- Add local decrypt/encrypt flow.
- Add monthly encrypted data loading and saving.

Phase 4: Scheduling, attendance, and makeup lessons

- Add recurring schedule rules.
- Add today's lesson reminder view.
- Add campus display in reminders and lesson records.
- Add draft lesson generation for a date range/month.
- Add confirm/cancel/edit flow for scheduled lessons.
- Add attendance marking for one-on-one and class courses.
- Add leave/absence/cancelled states.
- Add makeup lesson linking.
- Add class-course fee calculation: base fee + attended head fee.
- Add fee snapshots for confirmed lessons.
- Add lesson content and homework fields.
- Add next-lesson homework reminder linking and manual override.

Phase 5: Statistics and charts

- Add daily, weekly, monthly, yearly summaries.
- Add salary trend and lesson count charts.
- Add base salary and lesson-fee breakdown.
- Add one-on-one/class/makeup income breakdown.
- Add attendance and leave/absence summaries.
- Add export for teacher's own data.

Phase 6: Admin dashboard

- Add admin login/role support.
- Add user count and user list.
- Add enable/disable user.
- Add login-page notice editor.
- Add top-right app notice behavior.
- Add left-bottom privacy reminder area in the app shell.

Phase 7: Deletion and recovery

- Add teacher self-delete.
- Add password change.
- Add recovery-code password reset.
- Decide whether admin permanent delete is enabled in first version.

Phase 8: Testing and deployment

- Add unit tests for encryption helpers and statistics.
- Add tests for salary formulas, class attendance, and makeup links.
- Add tests for schedule generation, today's reminders, and homework carry-over.
- Add API tests where practical.
- Test production build locally.
- Deploy to Cloudflare from GitHub.
- Verify D1 migrations and bindings.

## 16. Final Direction

The first production-ready version should prioritize:

1. Simple teacher experience.
2. Strong privacy promise.
3. Minimal admin visibility.
4. Efficient repeated lesson entry.
5. Accurate class-course attendance and salary calculation.
6. Clean Cloudflare deployment.
7. Easy GitHub synchronization.

The recommended MVP is:

```text
username/password login
single recovery code
client-side encrypted teacher data
campus/location management
student and course/class management
recurring schedule rules
today's lesson reminders
backfilled lesson entry
attendance, leave, absence, and makeup markers
lesson content and homework records
homework carried into next-lesson reminders with manual adjustment
one-on-one and class-course salary formulas
base salary plus lesson-fee calculation
teacher-side statistics
admin user count/status only
admin-editable login/top-right notice
collapsible left sidebar
left-bottom privacy reminder
Cloudflare D1 deployment from GitHub
```
