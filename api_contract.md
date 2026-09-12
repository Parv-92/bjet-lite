# Smart Budget API Contract for Frontend Development

**API Base URL**: `http://localhost:8000/api/v1`  
**Interactive Docs**: `http://localhost:8000/docs` (Swagger UI) / `http://localhost:8000/redoc` (ReDoc)  
**API Version**: `0.3.0`  
**Authentication Scheme**: Bearer JWT (`Authorization: Bearer <access_token>`)  
**Route Policy**: All API routes use **no trailing slashes** consistently.

---

## Table of Contents
1. [Authentication](#1-authentication)
2. [Categories](#2-categories)
3. [Transactions](#3-transactions)
4. [Receipt Scanning](#4-receipt-scanning)
5. [Transaction Confirmation](#5-transaction-confirmation)
6. [Budgets](#6-budgets)
7. [Merchant Rules & Categorization Engine](#7-merchant-rules--categorization-engine)
8. [Error Response Conventions](#8-error-response-conventions)

---

## 1. Authentication

### 1.1 Register New User
- **HTTP Method**: `POST`
- **URL**: `/api/v1/auth/register`
- **Authentication**: None (Public)
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "full_name": "Jane Doe"
  }
  ```
- **Response Structure (`201 Created`)**:
  ```json
  {
    "id": 1,
    "email": "user@example.com",
    "full_name": "Jane Doe",
    "is_active": true,
    "created_at": "2026-09-04T06:30:00.000Z"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: `{"detail": "Email is already registered"}`
  - `422 Unprocessable Entity`: Invalid email format or missing fields.

---

### 1.2 User Login (Get JWT Token)
- **HTTP Method**: `POST`
- **URL**: `/api/v1/auth/login`
- **Authentication**: None (Public)
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Response Structure (`200 OK`)**:
  ```json
  {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer"
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: `{"detail": "Incorrect email or password"}`
  - `422 Unprocessable Entity`: Missing fields or invalid JSON.

---

### 1.3 Get Current User Profile
- **HTTP Method**: `GET`
- **URL**: `/api/v1/auth/me`
- **Authentication**: Yes (`Bearer <token>`)
- **Response Structure (`200 OK`)**:
  ```json
  {
    "id": 1,
    "email": "user@example.com",
    "full_name": "Jane Doe",
    "is_active": true,
    "created_at": "2026-09-04T06:30:00.000Z"
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: `{"detail": "Could not validate credentials"}`

---

## 2. Categories

### 2.1 List Categories
- **HTTP Method**: `GET`
- **URL**: `/api/v1/categories`
- **Authentication**: Yes (`Bearer <token>`)
- **Response Structure (`200 OK`)**: Array of categories (system defaults + user custom categories).
  ```json
  [
    {
      "id": 1,
      "name": "Food & Dining",
      "icon": "utensils",
      "color": "#FF5722",
      "is_system_default": true,
      "user_id": null,
      "created_at": "2026-09-04T06:00:00.000Z",
      "updated_at": "2026-09-04T06:00:00.000Z"
    },
    {
      "id": 11,
      "name": "Uncategorized",
      "icon": "question-circle",
      "color": "#9E9E9E",
      "is_system_default": true,
      "user_id": null,
      "created_at": "2026-09-04T06:00:00.000Z",
      "updated_at": "2026-09-04T06:00:00.000Z"
    },
    {
      "id": 12,
      "name": "Crypto Investments",
      "icon": "bitcoin",
      "color": "#F7931A",
      "is_system_default": false,
      "user_id": 1,
      "created_at": "2026-09-04T07:15:00.000Z",
      "updated_at": "2026-09-04T07:15:00.000Z"
    }
  ]
  ```

---

### 2.2 Get Category by ID
- **HTTP Method**: `GET`
- **URL**: `/api/v1/categories/{category_id}`
- **Authentication**: Yes (`Bearer <token>`)
- **Response Structure (`200 OK`)**: Single category object.
- **Error Responses**:
  - `404 Not Found`: `{"detail": "Category with ID 99 not found."}` (tenant isolation protected)

---

### 2.3 Create Custom Category
- **HTTP Method**: `POST`
- **URL**: `/api/v1/categories`
- **Authentication**: Yes (`Bearer <token>`)
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "name": "Freelance Work",
    "icon": "laptop",
    "color": "#4CAF50"
  }
  ```
- **Response Structure (`201 Created`)**: Created category object.
- **Error Responses**:
  - `400 Bad Request`: `{"detail": "A category with the name 'Freelance Work' already exists."}`
  - `422 Unprocessable Entity`

---

### 2.4 Update Custom Category
- **HTTP Method**: `PUT`
- **URL**: `/api/v1/categories/{category_id}`
- **Authentication**: Yes (`Bearer <token>`)
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "name": "Freelance & Consulting",
    "icon": "briefcase",
    "color": "#388E3C"
  }
  ```
- **Response Structure (`200 OK`)**: Updated category object.
- **Error Responses**:
  - `403 Forbidden`: `{"detail": "System default categories cannot be modified."}`
  - `404 Not Found`: `{"detail": "Category with ID 99 not found."}`
  - `400 Bad Request`: `{"detail": "A category with the name '...' already exists."}`

---

### 2.5 Delete Custom Category
- **HTTP Method**: `DELETE`
- **URL**: `/api/v1/categories/{category_id}`
- **Authentication**: Yes (`Bearer <token>`)
- **Response Structure (`204 No Content`)**: Empty response body.
- **Error Responses**:
  - `403 Forbidden`: `{"detail": "System default categories cannot be deleted."}`
  - `404 Not Found`: `{"detail": "Category with ID 99 not found."}`

---

## 3. Transactions

### 3.1 List Transactions (Lightweight)
- **HTTP Method**: `GET`
- **URL**: `/api/v1/transactions`
- **Authentication**: Yes (`Bearer <token>`)
- **Query Parameters**:
  - `skip` *(int, optional, default=0, ge=0)*: Pagination offset.
  - `limit` *(int, optional, default=50, ge=1, le=100)*: Max records to return.
  - `category_id` *(int, optional)*: Filter by category ID.
  - `status` *(string, optional)*: `PENDING_CONFIRMATION`, `CONFIRMED`, or `MANUAL`.
  - `start_date` *(ISO-8601 datetime, optional)*: Filter on/after timestamp.
  - `end_date` *(ISO-8601 datetime, optional)*: Filter on/before timestamp.
- **Note**: The list response is lightweight and does **not** include heavy OCR raw text or internal storage file paths. It includes `has_receipt: bool`.
- **Response Structure (`200 OK`)**:
  ```json
  [
    {
      "id": 101,
      "user_id": 1,
      "amount": "450.50",
      "currency": "INR",
      "timestamp": "2026-09-04T10:30:00.000Z",
      "merchant_id": 5,
      "merchant_raw_name": "Swiggy",
      "category_id": 1,
      "upi_reference_id": "123456789012",
      "upi_vpa": "swiggy@icici",
      "payment_app": "Google Pay",
      "status": "CONFIRMED",
      "notes": "Team lunch",
      "has_receipt": true,
      "created_at": "2026-09-04T10:30:00.000Z",
      "updated_at": "2026-09-04T10:30:00.000Z",
      "category": {
        "id": 1,
        "name": "Food & Dining",
        "icon": "utensils",
        "color": "#FF5722",
        "is_system_default": true,
        "user_id": null
      },
      "merchant": {
        "id": 5,
        "name": "Swiggy",
        "clean_name": "SWIGGY",
        "upi_vpa": "swiggy@icici",
        "default_category_id": 1
      }
    }
  ]
  ```

---

### 3.2 Create Manual Transaction
- **HTTP Method**: `POST`
- **URL**: `/api/v1/transactions`
- **Authentication**: Yes (`Bearer <token>`)
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "amount": 150.00,
    "currency": "INR",
    "timestamp": "2026-09-04T11:00:00.000Z",
    "merchant_raw_name": "Local Chai",
    "category_id": null,
    "upi_reference_id": "987654321012",
    "upi_vpa": "chai@paytm",
    "payment_app": "PhonePe",
    "notes": "Evening tea"
  }
  ```
  *(Note: If `category_id` is omitted, the intelligent categorization engine automatically predicts and assigns a category)*
- **Response Structure (`201 Created`)**: Returns `TransactionDetailResponse`.
- **Error Responses**:
  - `404 Not Found`: `{"detail": "Category with ID 99 not found or not accessible."}`
  - `400 Bad Request`: Business rule violation.

---

### 3.3 Get Transaction Details
- **HTTP Method**: `GET`
- **URL**: `/api/v1/transactions/{transaction_id}`
- **Authentication**: Yes (`Bearer <token>`)
- **Response Structure (`200 OK`)**: Detailed transaction response including OCR `raw_extracted_text` (if scanned) and `has_receipt: bool`.
- **Error Responses**:
  - `404 Not Found`: `{"detail": "Transaction not found"}`

---

### 3.4 Stream Stored Receipt Image
- **HTTP Method**: `GET`
- **URL**: `/api/v1/transactions/{transaction_id}/receipt`
- **Authentication**: Yes (`Bearer <token>`)
- **Response**: Binary image stream (`image/png`, `image/jpeg`, or `image/webp`).
- **Error Responses**:
  - `401 Unauthorized`: Missing or invalid token.
  - `404 Not Found`: Transaction does not exist, belongs to another user (tenant isolation), or has no receipt stored.

---

### 3.5 Update Transaction
- **HTTP Method**: `PUT`
- **URL**: `/api/v1/transactions/{transaction_id}`
- **Authentication**: Yes (`Bearer <token>`)
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "amount": 160.00,
    "category_id": 2,
    "notes": "Updated note",
    "status": "CONFIRMED",
    "set_as_merchant_default": false
  }
  ```
  - `set_as_merchant_default` *(bool, optional, default=false)*: When `true`, atomically creates or updates a user-specific `UserMerchantRule` mapping the transaction's merchant pattern to `category_id`. Does not mutate global shared merchant entities.
- **Response Structure (`200 OK`)**: Returns updated `TransactionDetailResponse`.
- **Error Responses**:
  - `404 Not Found`: Transaction or category does not exist / not accessible.
  - `400 Bad Request`: Validation failure (e.g. setting merchant default without a valid category or without an identifiable merchant name).

---

### 3.6 Delete Transaction
- **HTTP Method**: `DELETE`
- **URL**: `/api/v1/transactions/{transaction_id}`
- **Authentication**: Yes (`Bearer <token>`)
- **Response Structure (`204 No Content`)**: Empty response body.
- **Error Responses**:
  - `404 Not Found`: Transaction not found.

---

## 4. Receipt Scanning

### 4.1 Scan UPI Receipt Screenshot
- **HTTP Method**: `POST`
- **URL**: `/api/v1/transactions/scan-receipt`
- **Authentication**: Yes (`Bearer <token>`)
- **Content-Type**: `multipart/form-data`
- **Request Body**:
  - `file`: Image binary (JPEG, PNG, or WebP; max 10MB).
- **Processing Behavior**:
  1. Validates MIME type and integrity.
  2. Saves non-destructive copy with server-generated UUID.
  3. Preprocesses image in memory and runs OCR.
  4. Parses amount, UTR, VPA, and merchant text.
  5. **Runs Intelligent Categorization Hierarchy**:
     - Evaluates `UserMerchantRule` (Priority 1).
     - Evaluates known merchant default (Priority 2).
     - Falls back to `Uncategorized` (Priority 3).
  6. Detects soft duplicates.
  7. **Creates draft transaction strictly in `PENDING_CONFIRMATION` status**.
  8. **Excluded from budgets** until user confirmation.
- **Response Structure (`201 Created`)**:
  ```json
  {
    "transaction": {
      "id": 105,
      "user_id": 1,
      "amount": "680.00",
      "currency": "INR",
      "timestamp": "2026-09-04T12:00:00.000Z",
      "merchant_id": 2,
      "merchant_raw_name": "Zomato Limited",
      "category_id": 1,
      "upi_reference_id": "723456789012",
      "upi_vpa": "zomato@hdfcbank",
      "payment_app": "PhonePe",
      "status": "PENDING_CONFIRMATION",
      "notes": null,
      "has_receipt": true,
      "raw_extracted_text": "PhonePe\nPaid to Zomato Limited\n₹680.00...",
      "created_at": "2026-09-04T12:00:05.000Z",
      "updated_at": "2026-09-04T12:00:05.000Z",
      "category": {
        "id": 1,
        "name": "Food & Dining",
        "icon": "utensils",
        "color": "#FF5722",
        "is_system_default": true,
        "user_id": null
      },
      "merchant": {
        "id": 2,
        "name": "Zomato",
        "clean_name": "ZOMATO",
        "upi_vpa": "zomato@hdfcbank",
        "default_category_id": 1
      }
    },
    "extraction": {
      "raw_text": "PhonePe\nPaid to Zomato Limited\n₹680.00...",
      "detected_app": "PhonePe",
      "confidence_score": 0.95,
      "warnings": []
    },
    "duplicate": {
      "is_duplicate": false,
      "existing_transaction_id": null,
      "reason": null
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: File size exceeded (>10MB), unsupported format, or corrupt file.

---

## 5. Transaction Confirmation

### 5.1 Confirm Pending Draft Transaction
- **HTTP Method**: `POST`
- **URL**: `/api/v1/transactions/{transaction_id}/confirm`
- **Authentication**: Yes (`Bearer <token>`)
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "amount": 680.00,
    "category_id": 1,
    "timestamp": "2026-09-04T12:00:00.000Z",
    "merchant_name": "Zomato",
    "notes": "Dinner order"
  }
  ```
  - `amount` *(decimal, required, gt=0)*
  - `category_id` *(int, required)*
  - `timestamp` *(ISO-8601 datetime, required)*
  - `merchant_name` *(string, optional)*
  - `notes` *(string, optional, max 500 chars)*
- **Rules & Behavior**:
  - Transaction MUST be in `PENDING_CONFIRMATION` status. Attempting to confirm an already confirmed transaction returns `400 Bad Request`.
  - Validates `category_id` exists and is accessible (`404 Not Found` if not).
  - Normalizes `merchant_name`, searches existing merchants to reuse existing record, or creates new verified merchant without duplicates.
  - Transitions status from `PENDING_CONFIRMATION` to **`CONFIRMED`**.
  - **Now included in monthly budget calculations**.
- **Response Structure (`200 OK`)**: Returns updated `TransactionDetailResponse` with `"status": "CONFIRMED"`.
- **Error Responses**:
  - `400 Bad Request`: Transaction is already confirmed, or amount <= 0.
  - `404 Not Found`: Transaction or category does not exist / not accessible.

---

## 6. Budgets

### 6.1 Set or Upsert Category Budget
- **HTTP Method**: `POST`
- **URL**: `/api/v1/budgets`
- **Authentication**: Yes (`Bearer <token>`)
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "category_id": 1,
    "month": 9,
    "year": 2026,
    "amount_limit": 5000.00
  }
  ```
- **Response Structure**:
  - Returns `201 Created` if creating a new budget for that category/month/year.
  - Returns `200 OK` if updating an existing budget limit (idempotent upsert).
  ```json
  {
    "id": 1,
    "user_id": 1,
    "category_id": 1,
    "month": 9,
    "year": 2026,
    "amount_limit": "5000.00",
    "created_at": "2026-09-04T06:00:00.000Z",
    "updated_at": "2026-09-04T06:00:00.000Z",
    "category": null
  }
  ```
- **Error Responses**:
  - `404 Not Found`: Category does not exist or is not accessible.
  - `422 Unprocessable Entity`: Month outside 1-12, amount <= 0, or missing fields.

---

### 6.2 Get Monthly Budget Summaries
- **HTTP Method**: `GET`
- **URL**: `/api/v1/budgets/summary`
- **Authentication**: Yes (`Bearer <token>`)
- **Query Parameters**:
  - `month` *(int, required, 1-12)*
  - `year` *(int, required, 2000-2100)*
- **Response Structure (`200 OK`)**:
  ```json
  [
    {
      "id": 1,
      "user_id": 1,
      "category_id": 1,
      "month": 9,
      "year": 2026,
      "amount_limit": "5000.00",
      "created_at": "2026-09-04T06:00:00.000Z",
      "updated_at": "2026-09-04T06:00:00.000Z",
      "category": {
        "id": 1,
        "name": "Food & Dining",
        "icon": "utensils",
        "color": "#FF5722",
        "is_system_default": true,
        "user_id": null
      },
      "spent_amount": "680.00",
      "remaining_amount": "4320.00",
      "percentage_used": 13.6,
      "is_over_budget": false
    }
  ]
  ```
  *(Excludes `PENDING_CONFIRMATION` drafts)*

---

### 6.3 Get Category Budget Status
- **HTTP Method**: `GET`
- **URL**: `/api/v1/budgets/{category_id}`
- **Authentication**: Yes (`Bearer <token>`)
- **Query Parameters**: `month`, `year`
- **Response Structure (`200 OK`)**: Single `BudgetSummary` object.
- **Error Responses**:
  - `404 Not Found`: No budget set for this category and period.

---

## 7. Merchant Rules & Categorization Engine

### Categorization Priority Hierarchy
When a transaction is logged or scanned, the backend predicts the category using the following strict hierarchy:
```
Receipt / Manual Transaction
          ↓
Merchant identified
          ↓
Priority 1: Check UserMerchantRule (User pattern preference)
          ↓
Priority 2: Check known Merchant default category
          ↓
Priority 3: Fallback to "Uncategorized" system category
          ↓
User reviews suggestion
          ↓
Confirmation
```

---

### 7.1 List User Merchant Rules
- **HTTP Method**: `GET`
- **URL**: `/api/v1/rules`
- **Authentication**: Yes (`Bearer <token>`)
- **Ordering**: Automatically sorted by `priority DESC, created_at DESC`.
- **Response Structure (`200 OK`)**:
  ```json
  [
    {
      "id": 1,
      "user_id": 1,
      "merchant_pattern": "SWIGGY",
      "category_id": 1,
      "priority": 10,
      "created_at": "2026-09-04T08:00:00.000Z",
      "updated_at": "2026-09-04T08:00:00.000Z",
      "category": {
        "id": 1,
        "name": "Food & Dining",
        "icon": "utensils",
        "color": "#FF5722",
        "is_system_default": true,
        "user_id": null
      }
    }
  ]
  ```

---

### 7.2 Create Merchant Rule
- **HTTP Method**: `POST`
- **URL**: `/api/v1/rules`
- **Authentication**: Yes (`Bearer <token>`)
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "merchant_pattern": "UBER",
    "category_id": 3,
    "priority": 5
  }
  ```
  - `merchant_pattern` *(string, required, 1-100 chars)*: Text pattern for case-insensitive substring matching against merchant name / UPI VPA (e.g., rule `"SWIGGY"` matches `"Swiggy Limited"`). Arbitrary regex matching is rejected/not used.
  - `category_id` *(int, required)*: Category to map to.
  - `priority` *(int, optional, default=1, 1-100)*: Evaluation priority (higher number evaluated first).
- **Matching & Duplicate Rules**:
  - Whitespace is collapsed and trimmed, and text is uppercased before duplicate checking and persistence.
  - Evaluation ordering: `priority DESC`, then `created_at DESC` when priorities are equal.
  - Categorization works on `merchant_raw_name` even when no resolved `Merchant` database entity exists.
  - Global `Merchant.default_category_id` values are protected and are **never** overwritten when individual users confirm transactions with different categories. User preferences are strictly maintained through `UserMerchantRule`.
- **Response Structure (`201 Created`)**: Created rule object.
- **Error Responses**:
  - `404 Not Found`: Category does not exist or is not accessible.
  - `400 Bad Request`: A rule for this pattern already exists for the user.
  - `422 Unprocessable Entity`: Pattern length outside 1-100 or priority outside 1-100.

---

### 7.3 Delete Merchant Rule
- **HTTP Method**: `DELETE`
- **URL**: `/api/v1/rules/{rule_id}`
- **Authentication**: Yes (`Bearer <token>`)
- **Response Structure (`204 No Content`)**: Empty response body.
- **Error Responses**:
  - `404 Not Found`: Rule not found or belongs to another user (tenant isolation).

---

## 8. Error Response Conventions

Every endpoint adheres to standard HTTP status codes and domain error conventions:

| HTTP Status | Meaning | Usage Scenario |
|---|---|---|
| **401 Unauthorized** | Missing or Invalid Token | Missing `Authorization` header, expired JWT, or invalid signature. |
| **403 Forbidden** | Explicitly Prohibited Operation | Modifying or deleting system default categories (`is_system_default=True`). |
| **404 Not Found** | Resource Not Found / Inaccessible | Requested ID does not exist, belongs to another user (tenant isolation), or receipt file missing. |
| **400 Bad Request** | Domain Business Rule Violation | Duplicate name/pattern, confirming an already confirmed transaction, amount <= 0, or corrupt image. |
| **422 Unprocessable Entity** | Schema / Validation Failure | Pydantic validation error: missing required fields, invalid month (not 1-12), or invalid email format. |
