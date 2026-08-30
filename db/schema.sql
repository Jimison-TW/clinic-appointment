-- 診所預約系統 schema
-- PostgreSQL 16
--
-- 建表順序 = 被參照的表先建（departments -> users -> doctors/patients -> ...）

-- ============================================================
-- departments（科別）  ※ 教練示範，其餘由 Jimison 手寫
-- ============================================================
CREATE TABLE departments (
    id          int         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        varchar(50) NOT NULL,
    phone       varchar(30),
    address     text,
    deleted_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 軟刪除的表，唯一性一律寫在 CREATE TABLE 外面（欄位級 UNIQUE 不能帶 WHERE）
CREATE UNIQUE INDEX ux_departments_name_active
    ON departments (name)
    WHERE deleted_at IS NULL;


-- ============================================================
-- users（帳號）        ← TODO: 你寫
-- ============================================================
CREATE TABLE users(
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name varchar(50) NOT NULL,
    account varchar(255) NOT NULL UNIQUE,
    password_hash varchar(255) NOT NULL,
    role varchar(50) NOT NULL CHECK(role IN ('admin', 'doctor', 'patient', 'staff')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    try_count smallint NOT NULL DEFAULT 0,
    last_login_at timestamptz
);

-- ============================================================
-- doctors（醫師）      ← TODO: 你寫
-- ============================================================
CREATE TABLE doctors(
    id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    department_id int REFERENCES departments(id) ON DELETE RESTRICT,
    user_id bigint UNIQUE,
    FOREIGN KEY(user_id) REFERENCES users(id) 
        ON DELETE RESTRICT,
    license varchar(30) NOT NULL,
    phone varchar(30),
    address text,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz
);

CREATE INDEX idx_doctors_department_id ON doctors(department_id);
CREATE UNIQUE INDEX ux_doctors_license_active 
    ON doctors(license) 
    WHERE deleted_at IS NULL;

-- ============================================================
-- patients（病患）     ← TODO: 你寫
-- ============================================================
CREATE TABLE patients(
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mrn bigint GENERATED ALWAYS AS IDENTITY (START WITH 1000000) NOT NULL UNIQUE,
    user_id bigint UNIQUE,
        FOREIGN KEY(user_id) 
        REFERENCES users(id)
        ON DELETE RESTRICT,
    ic_id varchar(50) NOT NULL,
    phone varchar(30),
    address text,
    birth_date date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz
);

CREATE UNIQUE INDEX ux_patients_ic_id_active 
    ON patients(ic_id) 
    WHERE deleted_at IS NULL;


CREATE TABLE refresh_tokens (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL,
        FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,
    token_hash varchar(64) UNIQUE NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    revoked_reason varchar(50),
    replaced_by bigint REFERENCES refresh_tokens(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_refresh_tokens_user_active ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
