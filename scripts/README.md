# Database Export Scripts

## export-database.js

Comprehensive database export script that generates a detailed markdown report of all database data.

### Usage

```bash
# From backend directory
npm run export:db

# Or directly
node scripts/export-database.js
```

### Output

Generates `DATABASE_EXPORT.md` in the backend root directory with:

#### Sections Included:

1. **👥 Users**
   - All users with ID, name, email, role, and creation date

2. **🏘️ Communities**
   - For each community:
     - Creator information
     - Slug, category, description
     - Price type and member count
     - All associated:
       - **Courses** (with enrollment count, published status)
       - **Challenges** (with participant count, active status)
       - **Products** (with price, sales, published status)
       - **Posts** (with author, likes, creation date)
       - **Sessions** (with booking count)
       - **Events** (with registration count)
     - **Members** list

3. **📚 Course Enrollments**
   - User enrollments with progress and completion status

4. **💳 Orders**
   - All orders with user, amount, status, type

5. **🎯 Subscriptions**
   - All subscriptions with plan, status, renewal date

6. **📈 Summary Statistics**
   - Total counts for all major entities

### Example Output Structure

```markdown
# 📊 Database Export Report
Generated: 2025-12-06T18:00:00.000Z
Database: mongodb://localhost:27017/chabaqa

## 👥 Users

| ID | Name | Email | Role | Created |
|---|---|---|---|---|
| 692efc34 | Sarah Wilson | sarah@example.com | creator | 12/1/2025 |

## 🏘️ Communities

### Web Development Mastery

**Creator:** Sarah Wilson (sarah@example.com)
**Slug:** web-dev-mastery
**Category:** Technology
**Members:** 5
**Created:** 12/1/2025

#### Members

| Name | Email |
|---|---|
| John Doe | john@example.com |

#### Courses

| Title | Enrollments | Published | Created |
|---|---|---|---|
| React Basics | 3 | ✅ | 12/2/2025 |

...
```

### Requirements

- Node.js (v14+)
- MongoDB connection configured in `.env`
- `mongoose` package (already installed)

### Environment Variables

The script uses:
- `MONGODB_URI` - MongoDB connection string (defaults to `mongodb://localhost:27017/chabaqa`)

### Features

- ✅ Exports all users and their roles
- ✅ Lists all communities with their creators
- ✅ Shows all members of each community
- ✅ Includes all courses, challenges, products, posts, sessions, events per community
- ✅ Displays enrollment information
- ✅ Shows order and subscription data
- ✅ Generates summary statistics
- ✅ Formatted markdown output for easy reading
- ✅ Handles missing data gracefully with fallbacks

### Notes

- The script connects to MongoDB, exports data, and disconnects
- Large databases may take a few seconds to export
- Output file is overwritten each time the script runs
- All dates are formatted as local date strings
- IDs are truncated to 8 characters for readability in tables
