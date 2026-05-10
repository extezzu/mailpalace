"""SQLAlchemy ORM models. Mirrors data model in architecture spec section C."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String, nullable=False)  # 'gmail' | 'imap'
    label: Mapped[str] = mapped_column(String, nullable=False)
    email_address: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    config_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_sync_state: Mapped[str | None] = mapped_column(String, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )

    threads: Mapped[list[Thread]] = relationship(back_populates="account", cascade="all, delete-orphan")
    emails: Mapped[list[Email]] = relationship(back_populates="account", cascade="all, delete-orphan")


class Thread(Base):
    __tablename__ = "threads"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    provider_thread_id: Mapped[str] = mapped_column(String, nullable=False)
    subject: Mapped[str | None] = mapped_column(String, nullable=True)
    participants_json: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    last_message_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    message_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    account: Mapped[Account] = relationship(back_populates="threads")
    emails: Mapped[list[Email]] = relationship(back_populates="thread")

    __table_args__ = (
        UniqueConstraint("account_id", "provider_thread_id", name="uq_threads_account_thread"),
        Index("idx_threads_account_lastmsg", "account_id", "last_message_at"),
    )


class Email(Base):
    __tablename__ = "emails"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    thread_id: Mapped[int | None] = mapped_column(ForeignKey("threads.id", ondelete="SET NULL"), nullable=True)
    provider_msg_id: Mapped[str] = mapped_column(String, nullable=False)
    rfc822_message_id: Mapped[str | None] = mapped_column(String, nullable=True)
    from_name: Mapped[str | None] = mapped_column(String, nullable=True)
    from_email: Mapped[str] = mapped_column(String, nullable=False)
    to_json: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    cc_json: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    subject: Mapped[str | None] = mapped_column(String, nullable=True)
    snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    raw_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_unread: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_starred: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_attachments: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Labels coming from the upstream provider (Gmail label ids, IMAP
    # folder names). Drives the inbox/spam/sent split so emails Gmail
    # categorised as Spam don't pollute the user's primary inbox.
    provider_labels: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    # When set, the user replied to (or sent) this email. Inbox queries hide
    # these rows; the Sent folder reads them.
    replied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # When set, the row has been moved to the Trash folder.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # When set, the email is hidden from the inbox until this timestamp.
    snoozed_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )

    account: Mapped[Account] = relationship(back_populates="emails")
    thread: Mapped[Thread | None] = relationship(back_populates="emails")
    ai: Mapped[AIMetadata | None] = relationship(back_populates="email", uselist=False, cascade="all, delete-orphan")
    drafts: Mapped[list[Draft]] = relationship(back_populates="email", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("account_id", "provider_msg_id", name="uq_emails_account_msg"),
        Index("idx_emails_account_received", "account_id", "received_at"),
        Index("idx_emails_thread", "thread_id", "received_at"),
    )


class AIMetadata(Base):
    __tablename__ = "ai_metadata"

    email_id: Mapped[int] = mapped_column(ForeignKey("emails.id", ondelete="CASCADE"), primary_key=True)
    language_code: Mapped[str | None] = mapped_column(String, nullable=True)
    classification: Mapped[str | None] = mapped_column(String, nullable=True)
    classification_confidence: Mapped[float | None] = mapped_column(nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_locale: Mapped[str | None] = mapped_column(String, nullable=True)
    suggested_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider_used: Mapped[str] = mapped_column(String, nullable=False)
    model_version: Mapped[str | None] = mapped_column(String, nullable=True)
    triaged_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    email: Mapped[Email] = relationship(back_populates="ai")

    __table_args__ = (
        Index("idx_ai_classification", "classification"),
        Index("idx_ai_language", "language_code"),
    )


class Draft(Base):
    __tablename__ = "drafts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email_id: Mapped[int] = mapped_column(ForeignKey("emails.id", ondelete="CASCADE"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    language_code: Mapped[str] = mapped_column(String, nullable=False)
    provider_used: Mapped[str] = mapped_column(String, nullable=False)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )
    superseded_by: Mapped[int | None] = mapped_column(ForeignKey("drafts.id"), nullable=True)

    email: Mapped[Email] = relationship(back_populates="drafts")

    __table_args__ = (Index("idx_drafts_email", "email_id", "created_at"),)


class IngestRun(Base):
    __tablename__ = "ingest_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    new_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)  # running|ok|partial|failed
    error_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (Index("idx_ingest_account_started", "account_id", "started_at"),)


class SettingKV(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
