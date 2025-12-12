  # Design Document - Medical Documents Portal

---

## Table of Contents
1. [Tech Stack Choices](#tech-stack-choices)
2. [Scaling Strategy](#scaling-strategy)
3. [Architecture Overview](#architecture-overview)
4. [API Specification](#api-specification)
5. [Data Flow](#data-flow)
6. [Database Schema](#database-schema)
7. [Assumptions](#assumptions)

---

## Tech Stack Choices

### Q1: Frontend Framework - React (Vite)

**Why React?**

- **Component-Based Architecture:** Makes UI modular and reusable. Each part (FileUpload, DocumentList, DocumentItem) is an independent component that can be tested and maintained separately.

- **Virtual DOM:** React's virtual DOM ensures efficient rendering, especially important when updating document lists frequently without full page reloads.

- **Rich Ecosystem:** Large library of packages available:
  - Axios for API calls
  - React-Dropzone for file uploads
  - Material-UI or Tailwind for styling
  
- **Single Page Application (SPA):** Provides smooth user experience without page refreshes, making the app feel more responsive and modern.

- **Industry Standard:** Most widely used frontend framework, making it easier to find solutions, hire developers, and scale the team in the future.

- **Strong Community Support:** Extensive documentation, tutorials, and community support for troubleshooting.

---

### Q2: Backend Framework - Express.js , MVC Architecture

**Why Express.js?**

- **Lightweight & Flexible:** Minimal framework that doesn't impose strict structure, allowing custom architecture design.

- **Middleware Support:** Perfect for implementing:
  - File uploads (Multer)
  - Request validation
  - Error handling
  - CORS for frontend communication

- **JavaScript Everywhere:** Same language on frontend (React) and backend (Express), reducing context switching and allowing code sharing.

- **Large Ecosystem:** npm has thousands of packages for any functionality needed.

- **Performance:** Built on Node.js V8 engine, handles concurrent requests efficiently with non-blocking I/O.

**Why MVC (Model-View-Controller) Pattern?**

The application follows MVC architecture for clean separation of concerns:

- **Model** (`models/documentModel.js`): 
  - Handles all database operations
  - PostgreSQL queries (INSERT, SELECT, DELETE)
  - Data validation at database level

- **View** (React Frontend): 
  - User interface completely separated from backend
  - Communicates via REST API

- **Controller** (`controllers/documentController.js`): 
  - Business logic layer
  - Receives requests from routes
  - Processes file uploads
  - Validates inputs
  - Calls Model for database operations
  - Sends responses

**Benefits of MVC:**
- **Separation of Concerns:** Each layer has a single responsibility
- **Maintainability:** Easy to locate and fix bugs
- **Testability:** Each layer can be unit tested independently
- **Scalability:** Easy to add new features without affecting other layers
- **Team Collaboration:** Multiple developers can work on different layers simultaneously

---

### Q3: Database - PostgreSQL


**Why PostgreSQL?**

- **ACID Compliance:** Guarantees data integrity through:
  - Atomicity: Transactions complete fully or not at all
  - Consistency: Data remains valid after transactions
  - Isolation: Concurrent transactions don't interfere
  - Durability: Committed data survives system failures
  
  *Critical for medical documents where data integrity is essential.

- **Concurrent Connections:** Handles multiple users uploading/downloading simultaneously without locking issues.
- **Performance:** 
  - Supports indexing for faster queries
  - Query optimization
  - Efficient joins and aggregations
- **Scalability:** Can handle millions of records efficiently with proper indexing.
- **Easy Cloud Migration:** AWS RDS PostgreSQL provides managed service with:
  - Automatic backups
  - Read replicas
  - Multi-AZ deployment
  - No code changes required to migrate
- **Rich Data Types:** Supports JSON, arrays, and custom types if needed for future features.
- **Open Source:** No licensing costs, active community development.

---

## Scaling Strategy

### Q4: Supporting 1,000+ Users

**Current Architecture (Development):**
```
User Browser
    ↓
React App (localhost:3000)
    ↓
Express API (localhost:5000)
    ↓
PostgreSQL (localhost:5432)
    ↓
Local File System (uploads/)
```

**Limitations:**
- Single server (no redundancy)
- Local file storage (limited capacity, no backup)
- No load distribution
- No authentication
- Single database instance (bottleneck)

---

### **Production Architecture for 1,000+ Users:**
```
                    Users (1,000+)
                         ↓
                  CloudFront CDN
                         ↓
              Route 53 (DNS) / SSL
                         ↓
         Application Load Balancer (ALB)
                         ↓
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
   [EC2-1]          [EC2-2]          [EC2-3]
  Express App     Express App     Express App
    (Auto Scaling Group)
                         ↓
                ┌────────┴────────┐
                ↓                 ↓
        ElastiCache           RDS PostgreSQL
          (Redis)          (Master + Read Replicas)
                ↓
              S3 Bucket
           (File Storage)
                ↓
        SQS + Lambda Functions
      (Background Processing)
                ↓
           CloudWatch
         (Monitoring/Logs)
```

---

### **Detailed Scaling Changes:**

#### 1. **File Storage: Migrate to AWS S3**

**Current:** Local `uploads/` folder
**Problem:** 
- Limited disk space
- No redundancy (data loss if server fails)
- Can't share files across multiple servers

**Solution: AWS S3**
- **Unlimited Storage:** Scales automatically
- Durability: Data replicated across multiple availability zones
- High Availability
- **Versioning:** Keep file history
- **Lifecycle Policies:** Auto-archive old files to cheaper storage
- **Direct Upload:** Stream files directly to S3 without saving locally first

**Implementation:**
- Use AWS SDK for S3
- Generate pre-signed URLs for secure downloads
- Use multipart upload for large files

---

#### 2. **Compute: AWS EC2 with Auto Scaling**

**Current:** Single Express server
**Problem:** 
- Server crash = entire app down
- Can't handle traffic spikes
- Limited CPU/memory

**Solution: EC2 Auto Scaling Groups**
- **Multiple Instances:** Run Express app on 3-5 EC2 instances
- **Auto Scaling:** Automatically adds/removes instances based on:
  - CPU usage > 70% → add instance
  - CPU usage < 30% → remove instance
  - Custom metrics (request count, response time)
- **Health Checks:** Unhealthy instances automatically replaced
- **Zero Downtime Deployments:** Rolling updates

**Alternative: AWS Elastic Beanstalk**
- Managed service that handles auto-scaling automatically
- Easier deployment process
- Built-in monitoring

---

#### 3. **Load Balancing: AWS Application Load Balancer (ALB)**

**Purpose:** Distribute traffic across multiple EC2 instances

**Features:**
- **Layer 7 Load Balancing:** Routes based on HTTP/HTTPS content
- **Health Checks:** Removes unhealthy instances from rotation
- **SSL Termination:** Handles HTTPS, backend uses HTTP
- **Sticky Sessions:** Same user → same instance (if needed)
- **Path-Based Routing:** Different endpoints → different instance groups

**Configuration:**
- Health check endpoint: `GET /api/health`
- Check interval: 30 seconds
- Unhealthy threshold: 2 consecutive failures

---

#### 4. **Database: AWS RDS PostgreSQL with Read Replicas**

**Current:** Single PostgreSQL instance
**Problem:**
- All reads and writes on same instance
- Bottleneck under heavy load
- No automatic backups

**Solution: RDS PostgreSQL**

**Master Instance (Writes):**
- Handles all INSERT, UPDATE, DELETE operations
- Multi-AZ deployment for high availability

**Read Replicas (Reads):**
- 2-3 read replicas for SELECT queries
- Reduces load on master by 60-80%
- Eventually consistent (slight delay acceptable)

**Features:**
- **Automatic Backups:** Daily snapshots, 7-35 days retention
- **Point-in-Time Recovery:** Restore to any second in retention period
- **Automated Patching:** Security updates applied automatically
- **Monitoring:** Built-in CloudWatch metrics

**Connection Pooling:**
- Use `pg-pool` to manage database connections
- Pool size: 20-50 connections per instance
- Prevents connection exhaustion

---

#### 5. **Authentication: OTP-Based Passwordless**

**Current:** No authentication (single user)
**Production Need:** Multi-user with secure login

**Solution: OTP (One-Time Password) Authentication**

**Flow:**
1. User enters email or phone number
2. System generates 6-digit OTP (valid 5 minutes)
3. Send OTP via:
   - **Email:** AWS SES (Simple Email Service)
   - **SMS:** AWS SNS (Simple Notification Service)
4. User enters OTP
5. System validates and creates session
6. Session token stored in Redis (fast lookup)

**Benefits:**
- **Better UX:** No passwords to remember/reset
- **More Secure:** OTP expires quickly
- **Reduces Support:** No password reset requests
- **Modern:** Industry trend (Slack, Medium use this)

**Implementation:**
- JWT tokens for session management
- Token expiry: 24 hours
- Refresh tokens: 30 days

---

#### 6. **Caching: Redis (AWS ElastiCache)**

**Purpose:** Reduce database load and improve response times

**What to Cache:**
- Document lists (most frequent query)
- User sessions and authentication tokens
- Frequently accessed metadata

**Cache Strategy:**
- **TTL (Time To Live):** 5 minutes for document lists
- **Cache Invalidation:** Clear cache on upload/delete
- **Cache-Aside Pattern:** 
  1. Check cache first
  2. If miss, query database
  3. Store in cache for next request

**Performance Gain:**
- 70-90% reduction in database queries
- Response time: 200ms → 20ms for cached data

---

#### 7. **CDN: AWS CloudFront**

**Purpose:** Serve files faster globally

**How It Works:**
- CloudFront edge locations cache files in 200+ locations worldwide
- User downloads from nearest edge location
- First download: CloudFront fetches from S3
- Subsequent downloads: Served from edge (much faster)

**Benefits:**
- **Faster Downloads:** 3x-10x faster for international users
- **Reduced S3 Costs:** Fewer requests to S3
- **DDoS Protection:** Built-in protection

---

#### 8. **Monitoring: AWS CloudWatch**

**Metrics to Track:**
- API response times (p50, p95, p99)
- Error rates (4xx, 5xx responses)
- Upload success/failure rates
- Database query times
- EC2 CPU/memory usage
- Auto-scaling events

**Alerts:**
- Error rate > 5% → Page on-call engineer
- Response time > 2 seconds → Warning
- Disk space > 80% → Scale storage

**Logging:**
- Centralized logs from all EC2 instances
- Searchable with CloudWatch Logs Insights
- Retention: 30 days

---

#### 9. **Security Enhancements**

**HTTPS/SSL:**
- AWS Certificate Manager for free SSL certificates
- Force HTTPS for all requests
- HSTS headers

**Rate Limiting:**
- 100 requests per minute per user
- 10 uploads per hour per user
- Prevents abuse and DOS attacks

**Input Validation:**
- File type validation (PDF only) on frontend AND backend
- File size limit: 10MB
- Filename sanitization (prevent path traversal)

**Virus Scanning:**
- AWS Lambda + ClamAV
- Scan all uploads before saving
- Quarantine suspicious files

**CORS Configuration:**
- Whitelist specific frontend domains
- No wildcard (*) in production

---

#### 10. **Background Processing: SQS + Lambda**

**Use Cases:**
- Virus scanning uploaded files
- Generating thumbnails/previews
- Sending notification emails
- Cleanup old files

**Architecture:**
1. User uploads file
2. API returns immediately (don't make user wait)
3. Message sent to SQS queue
4. Lambda function triggered by queue
5. Lambda processes task asynchronously

**Benefits:**
- API stays fast and responsive
- Scalable (Lambda handles concurrency)
- Fault tolerant (retries on failure)

---

### **Cost Estimation (1,000 Users)**

**Assumptions:**
- 1,000 active users
- 10 uploads per user per month = 10,000 uploads/month
- Average file size: 2MB
- 50,000 API requests per day

**Monthly Costs:**

| Service | Cost |
|---------|------|
| EC2 (3x t3.medium) | $100 |
| RDS PostgreSQL (db.t3.medium) | $70 |
| S3 Storage (20GB) + Requests | $5 |
| CloudFront | $10 |
| ElastiCache (Redis) | $40 |
| Application Load Balancer | $20 |
| SNS/SES (OTP) | $5 |
| CloudWatch | $10 |
| **Total** | **~$260/month** |

---

### **Performance Targets**

| Metric | Target |
|--------|--------|
| Upload Response Time | < 3 seconds |
| List Documents | < 500ms |
| Download Start | < 1 second |
| API Uptime | 99.9% |
| Concurrent Users | 1,000+ |
| Database Queries | < 100ms |

---

## Architecture Overview

### **Development Architecture**
```
┌─────────────────────────────────────────────────┐
│              User Browser                        │
│         (http://localhost:3000)                  │
└────────────────────┬────────────────────────────┘
                     │ HTTP Requests
                     ↓
┌─────────────────────────────────────────────────┐
│          React Frontend (Port 3000)              │
│                                                  │
│  Components:                                     │
│  - FileUpload (form)                             │
│  - DocumentList (displays all files)             │
│  - DocumentItem (individual file with buttons)   │
│  - Message (success/error notifications)         │
│                                                  │
│  Services:                                       │
│  - api.js (Axios for API calls)                  │
└────────────────────┬────────────────────────────┘
                     │ REST API Calls
                     ↓
┌─────────────────────────────────────────────────┐
│       Express Backend (Port 5000)                │
│                                                  │
│  MVC Architecture:                               │
│                                                  │
│  ┌─────────────┐                                │
│  │   Routes    │ (documentRoutes.js)             │
│  │ /api/docs/* │                                │
│  └──────┬──────┘                                │
│         │                                        │
│         ↓                                        │
│  ┌─────────────┐                                │
│  │ Controllers │ (documentController.js)         │
│  │ Business    │ - Upload file                   │
│  │ Logic       │ - List documents                │
│  │             │ - Download file                 │
│  │             │ - Delete file                   │
│  └──────┬──────┘                                │
│         │                                        │
│         ↓                                        │
│  ┌─────────────┐                                │
│  │   Models    │ (documentModel.js)              │
│  │  Database   │ - INSERT query                  │
│  │  Queries    │ - SELECT query                  │
│  │             │ - DELETE query                  │
│  └──────┬──────┘                                │
│         │                                        │
│  Middleware:                                     │
│  - Multer (file upload)                          │
│  - CORS (cross-origin)                           │
│  - Error handling                                │
└────────────────────┬────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────┐
│      PostgreSQL Database (Port 5432)             │
│                                                  │
│  Table: documents                                │
│  - id (PRIMARY KEY)                              │
│  - filename                                      │
│  - filepath                                      │
│  - filesize                                      │
│  - created_at                                    │
└────────────────────┬────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────┐
│       Local File System                          │
│       backend/uploads/                           │
│       - stores actual PDF files                  │
└─────────────────────────────────────────────────┘
```

---

### **Production Architecture (1,000+ Users)**
```
┌──────────────────────────────────────────────────────┐
│                     Users                             │
│              (Web Browsers, Mobile)                   │
└───────────────────────┬──────────────────────────────┘
                        │
                        ↓
┌──────────────────────────────────────────────────────┐
│              AWS CloudFront (CDN)                     │
│         Caches static files globally                  │
│         200+ edge locations                           │
└───────────────────────┬──────────────────────────────┘
                        │
                        ↓
┌──────────────────────────────────────────────────────┐
│         Route 53 (DNS) + SSL Certificate              │
│              (example.com → ALB)                      │
└───────────────────────┬──────────────────────────────┘
                        │
                        ↓
┌──────────────────────────────────────────────────────┐
│       Application Load Balancer (ALB)                 │
│       - Health checks every 30s                       │
│       - SSL termination                               │
│       - Distributes traffic                           │
└───────┬───────────────┬──────────────┬───────────────┘
        │               │              │
        ↓               ↓              ↓
   ┌────────┐      ┌────────┐    ┌────────┐
   │ EC2-1  │      │ EC2-2  │    │ EC2-3  │
   │Express │      │Express │    │Express │
   │  App   │      │  App   │    │  App   │
   └───┬────┘      └───┬────┘    └───┬────┘
       │               │              │
       └───────────────┼──────────────┘
                       │
              ┌────────┴────────┐
              │                 │
              ↓                 ↓
    ┌──────────────────┐  ┌─────────────────┐
    │  ElastiCache     │  │  RDS PostgreSQL │
    │    (Redis)       │  │   Master (Write)│
    │  - Sessions      │  │        +         │
    │  - Cache data    │  │   Read Replicas │
    └──────────────────┘  │   (2-3 slaves)  │
                          └─────────┬────────┘
                                    │
                                    ↓
                          ┌──────────────────┐
                          │    AWS S3        │
                          │  File Storage    │
                          │  - PDFs stored   │
                          │  - Pre-signed    │
                          │    URLs          │
                          └─────────┬────────┘
                                    │
                                    ↓
                          ┌──────────────────┐
                          │   SQS Queue      │
                          │  (async tasks)   │
                          └─────────┬────────┘
                                    │
                                    ↓
                          ┌──────────────────┐
                          │ Lambda Functions │
                          │ - Virus scan     │
                          │ - Notifications  │
                          │ - Cleanup        │
                          └─────────┬────────┘
                                    │
                                    ↓
                          ┌──────────────────┐
                          │   CloudWatch     │
                          │  - Logs          │
                          │  - Metrics       │
                          │  - Alerts        │
                          └──────────────────┘
```

---

## API Specification

### Base URL
- **Development:** `http://localhost:5000/api`
- **Production:** `https://api.example.com/api`

---

### 1. Upload Document

**Endpoint:** `POST /documents/upload`

**Description:** Upload a PDF file and store metadata in database

**Headers:**
```
Content-Type: multipart/form-data
```

**Request Body:** 
Validation:**

- File type must be `application/pdf`
- Maximum file size: 10MB
- Filename cannot be empty

**Success Response (201 Created):**

json

```json
{
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "id": 1,
    "filename": "1702123456789-prescription.pdf",
    "filepath": "uploads/1702123456789-prescription.pdf",
    "filesize": 245678,
    "created_at": "2024-12-09T10:30:00.000Z"
  }
}
```

**Error Responses:**

_400 Bad Request - No file:_

json

```json
{
  "success": false,
  "message": "No file uploaded"
}
```

_400 Bad Request - Wrong file type:_

json

```json
{
  "success": false,
  "message": "Only PDF files are allowed"
}
```

_413 Payload Too Large:_

json

```json
{
  "success": false,
  "message": "File size exceeds 10MB limit"
}
```

_500 Internal Server Error:_

json

```json
{
  "success": false,
  "message": "Error uploading file"
}
```

**Example with curl:**

bash

```bash
curl -X POST \
  -F "file=@/path/to/document.pdf" \
  http://localhost:5000/api/documents/upload
```

**Example with Postman:**

- Method: POST
- URL: [http://localhost:5000/api/documents/upload](http://localhost:5000/api/documents/upload)
- Body → form-data
- Key: `file` (type: File)
- Value: Select PDF file

---

### 2. List All Documents

**Endpoint:** `GET /documents`

**Description:** Retrieve list of all uploaded documents

**Headers:** None required

**Query Parameters:** None

**Success Response (200 OK):**

json

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "filename": "1702123456789-prescription.pdf",
      "filepath": "uploads/1702123456789-prescription.pdf",
      "filesize": 245678,
      "created_at": "2024-12-09T10:30:00.000Z"
    },
    {
      "id": 2,
      "filename": "1702123457890-test-results.pdf",
      "filepath": "uploads/1702123457890-test-results.pdf",
      "filesize": 512340,
      "created_at": "2024-12-09T11:15:00.000Z"
    }
  ]
}
```

**Empty List Response:**

json

```json
{
  "success": true,
  "data": []
}
```

**Error Response (500):**

json

```json
{
  "success": false,
  "message": "Error fetching documents"
}
```

**Example with curl:**

bash

```bash
curl http://localhost:5000/api/documents
```

**Example with Postman:**

- Method: GET
- URL: [http://localhost:5000/api/documents](http://localhost:5000/api/documents)

---

### 3. Download Document

**Endpoint:** `GET /documents/:id`

**Description:** Download a specific document by ID

**URL Parameters:**

- `id` (required): Document ID (integer)

**Success Response (200 OK):**

- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="prescription.pdf"`
- Body: PDF file stream

**Error Responses:**

_404 Not Found - Document doesn't exist:_

json

```json
{
  "success": false,
  "message": "Document not found"
}
```

_404 Not Found - File missing from server:_

json

```json
{
  "success": false,
  "message": "File not found on server"
}
```

_500 Internal Server Error:_

json

```json
{
  "success": false,
  "message": "Error downloading file"
}
```

**Example with curl:**

bash

````bash
# Download and save as file
curl http://localhost:5000/api/documents/1 -o downloaded.pdf

# Download and display info
curl -I http://localhost:5000/api/documents/1
```

**Example with Postman:**
- Method: GET
- URL: http://localhost:5000/api/documents/1
- Send & Save Response → Save to file

**Example with Browser:**
```
http://localhost:5000/api/documents/1
````

Browser will automatically download the file.

---

### 4. Delete Document

**Endpoint:** `DELETE /documents/:id`

**Description:** Delete a document from database and filesystem

**URL Parameters:**

- `id` (required): Document ID (integer)

**Success Response (200 OK):**

json

```json
{
  "success": true,
  "message": "Document deleted successfully"
}
```

**Error Responses:**

_404 Not Found:_

json

```json
{
  "success": false,
  "message": "Document not found"
}
```

_500 Internal Server Error:_

json

```json
{
  "success": false,
  "message": "Error deleting document"
}
```

**Example with curl:**

bash

```bash
curl -X DELETE http://localhost:5000/api/documents/1
```

**Example with Postman:**

- Method: DELETE
- URL: [http://localhost:5000/api/documents/1](http://localhost:5000/api/documents/1)

---

### API Error Handling

All endpoints follow consistent error response format:

json

```json
{
  "success": false,
  "message": "Error description"
}
```

**HTTP Status Codes:**

- `200` - Success (GET, DELETE)
- `201` - Created (POST upload)
- `400` - Bad Request (validation errors)
- `404` - Not Found (resource doesn't exist)
- `413` - Payload Too Large (file size exceeded)
- `500` - Internal Server Error (server-side issues)

---

## Data Flow

### Q5: Step-by-Step Process Flow

---

### **File Upload Flow**

**Step 1: User Selects File (Frontend)**

- User clicks "Choose File" button in React component
- Browser opens file picker dialog
- User selects a PDF file from their computer

**Step 2: Frontend Validation**

- React component checks file type: `file.type === 'application/pdf'`
- Checks file size: `file.size <= 10 * 1024 * 1024` (10MB)
- If validation fails:
    - Show error message: "Only PDF files under 10MB allowed"
    - Stop process
- If validation passes:
    - Show loading indicator
    - Proceed to upload

**Step 3: Create FormData Object (Frontend)**

- Create FormData: `const formData = new FormData()`
- Append file: `formData.append('file', selectedFile)`
- Prepare for HTTP request

**Step 4: Send HTTP POST Request (Frontend)**

- Axios sends POST request to `/api/documents/upload`
- Headers automatically set to `multipart/form-data`
- File data sent in request body

**Step 5: Request Received by Express (Backend - Route Layer)**

- Express router receives request at `POST /documents/upload`
- Routes request to upload controller
- But first, passes through Multer middleware

**Step 6: Multer Middleware Processing (Backend - Middleware Layer)**

- Multer intercepts the request
- Validates MIME type: checks if `application/pdf`
- Checks file size against limit (10MB)
- If validation fails:
    - Return 400 error
    - Stop process
- If validation passes:
    - Generates unique filename: `Date.now() + '-' + originalname`
    - Creates write stream to `uploads/` folder
    - Saves file to disk
    - Attaches file metadata to `req.file` object

**Step 7: Controller Receives Request (Backend - Controller Layer)**

- `documentController.upload()` function executes
- Extracts file metadata from `req.file`:
    - `filename`: Generated unique name
    - `path`: Full file path on server
    - `size`: File size in bytes
- Validates that file was actually received (check if `req.file` exists)

**Step 8: Controller Calls Model (Backend - Model Layer)**

- Controller calls `DocumentModel.create(filename, filepath, filesize)`
- Passes file metadata to model

**Step 9: Model Inserts into Database (Backend - Database Layer)**

- Model constructs SQL query:

sql

```sql
  INSERT INTO documents (filename, filepath, filesize)
  VALUES ($1, $2, $3)
  RETURNING *;
```

- Executes query against PostgreSQL
- PostgreSQL:
    - Validates data types
    - Generates auto-increment `id`
    - Sets `created_at` timestamp (current time)
    - Returns inserted record

**Step 10: Model Returns Result (Backend - Model Layer)**

- Model receives database response
- Returns document object with all fields to controller

**Step 11: Controller Sends Response (Backend - Controller Layer)**

- Controller formats success response:

json

```json
  {
    "success": true,
    "message": "File uploaded successfully",
    "data": { id, filename, filesize, created_at }
  }
```

- Sends HTTP 201 (Created) status
- Response sent back through Express

**Step 12: Frontend Receives Response**

- Axios promise resolves with response data
- React component processes response:
    - Hide loading indicator
    - Show success message: "File uploaded successfully!"
    - Add new document to list (update state)
    - Clear file input for next upload

---

### **File Download Flow**

**Step 1: User Clicks Download Button (Frontend)**

- User clicks download icon/button next to a document
- Frontend extracts document ID from data

**Step 2: Frontend Sends GET Request**

- Axios sends GET request to `/api/documents/:id`
- Example: `/api/documents/1`

**Step 3: Request Received by Express (Backend - Route Layer)**

- Express router matches route: `GET /documents/:id`
- Extracts `id` parameter from URL
- Routes to download controller

**Step 4: Controller Receives Request (Backend - Controller Layer)**

- `documentController.download()` function executes
- Extracts `id` from `req.params.id`
- Converts to integer if needed

**Step 5: Controller Calls Model (Backend - Model Layer)**

- Controller calls `DocumentModel.findById(id)`
- Requests document metadata from database

**Step 6: Model Queries Database (Backend - Database Layer)**

- Model constructs SQL query:

sql

```sql
  SELECT * FROM documents WHERE id = $1;
```

- Executes query against PostgreSQL
- PostgreSQL searches for matching record

**Step 7: Database Returns Result (Backend - Database Layer)**

- If document exists:
    - Returns record with all fields
- If document doesn't exist:
    - Returns empty result

**Step 8: Model Returns to Controller (Backend - Model Layer)**

- Model receives database response
- Returns document object (or null) to controller

**Step 9: Controller Validates Result (Backend - Controller Layer)**

- Checks if document was found
- If not found:
    - Return 404 error: "Document not found"
    - Stop process
- If found:
    - Extract `filepath` from document metadata
    - Resolve absolute file path

**Step 10: Controller Checks File Exists (Backend - Controller Layer)**

- Uses `fs.existsSync()` to verify file on disk
- If file missing:
    - Return 404 error: "File not found on server"
    - Stop process
    - (This handles case where DB record exists but file was manually deleted)

**Step 11: Controller Sends File (Backend - Controller Layer)**

- Sets response headers:
    - `Content-Type: application/pdf`
    - `Content-Disposition: attachment; filename="original.pdf"`
- Uses `res.download()` to stream file
- Express handles file streaming efficiently

**Step 12: Frontend Receives File Stream**

- Axios receives file data
- For direct download (using `<a>` tag or `window.open`):
    - Browser automatically downloads file
    - Shows in Downloads folder
- For programmatic download:
    - Create Blob from response
    - Create temporary download link
    - Trigger download
    - Clean up

**Step 13: Download Complete (Frontend)**

- Show success message: "File downloaded!"
- Browser notification: "Download complete"

---

### **File Delete Flow**

**Step 1: User Clicks Delete Button (Frontend)**

- User clicks delete icon/button next to a document
- Frontend shows confirmation dialog:
    - "Are you sure you want to delete this document?"
    - Buttons: Cancel, Delete

**Step 2: User Confirms Deletion (Frontend)**

- If user clicks "Cancel":
    - Close dialog, stop process
- If user clicks "Delete":
    - Show loading indicator on that document
    - Proceed with deletion

**Step 3: Frontend Sends DELETE Request**

- Axios sends DELETE request to `/api/documents/:id`
- Example: `/api/documents/1`

**Step 4: Request Received by Express (Backend - Route Layer)**

- Express router matches route: `DELETE /documents/:id`
- Extracts `id` parameter from URL
- Routes to delete controller

**Step 5: Controller Receives Request (Backend - Controller Layer)**

- `documentController.delete()` function executes
- Extracts `id` from `req.params.id`
- Converts to integer

**Step 6: Controller Calls Model to Find Document (Backend - Model Layer)**

- Controller calls `DocumentModel.findById(id)`
- Needs filepath before deleting

**Step 7: Model Queries Database (Backend - Database Layer)**

- Executes SELECT query to get document metadata
- Returns document record (or null)

**Step 8: Controller Validates Document Exists (Backend - Controller Layer)**

- Checks if document was found in database
- If not found:
    - Return 404 error: "Document not found"
    - Stop process
- If found:
    - Extract `filepath` from metadata
    - Proceed with deletion

**Step 9: Controller Deletes Physical File (Backend - Controller Layer)**

- Resolve absolute file path
- Check if file exists on disk: `fs.existsSync(filepath)`
- If file exists:
    - Delete file: `fs.unlinkSync(filepath)`
- If file doesn't exist:
    - Log warning (file already deleted or missing)
    - Continue anyway (clean up database)

**Step 10: Controller Calls Model to Delete Record (Backend - Model Layer)**

- Controller calls `DocumentModel.delete(id)`
- Requests database record deletion

**Step 11: Model Deletes from Database (Backend - Database Layer)**

- Model constructs SQL query:

sql

```sql
  DELETE FROM documents WHERE id = $1 RETURNING *;
```

- Executes query against PostgreSQL
- PostgreSQL:
    - Finds record by ID
    - Deletes record
    - Returns deleted record (for confirmation)

**Step 12: Model Returns Result (Backend - Model Layer)**

- Model receives deleted record from database
- Returns to controller

**Step 13: Controller Sends Success Response (Backend - Controller Layer)**

- Formats response:

json

```json
  {
    "success": true,
    "message": "Document deleted successfully"
  }
```

- Sends HTTP 200 (OK) status

**Step 14: Frontend Receives Response**

- Axios promise resolves
- React component processes response:
    - Remove document from list (update state)
    - Hide loading indicator
    - Show success message: "Document deleted successfully!"
    - Refresh document list UI

---

### **Error Handling Flow**

**At Each Step:**

- Wrapped in try-catch blocks
- If error occurs:
    - Log error details to console
    - Rollback any partial changes
    - Return appropriate HTTP status code
    - Send error message to frontend
    - Frontend displays error to user

**Example Error Scenarios:**

_Upload Fails:_

- Disk full → 500 error, "Error uploading file"
- Database connection lost → 500 error, "Error saving metadata"