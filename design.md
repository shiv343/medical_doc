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

### Q2: Backend Framework - Express.js, Node.js

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

## Architecture Overview


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
