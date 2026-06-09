from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from sqlalchemy.sql import func
from app.models.models import Base


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String(100), nullable=False)
    trigger      = Column(String(50), nullable=False)   # booking_request | manual | etc.
    recipient    = Column(String(20), default="guest")  # guest | admin
    is_active    = Column(Boolean, default=True)
    is_system    = Column(Boolean, default=False)       # has file fallback + can reset
    sort_order   = Column(Integer, default=0)

    subject_sv   = Column(Text, default="")
    subject_en   = Column(Text, default="")
    subject_de   = Column(Text, default="")
    body_sv      = Column(Text, default="")
    body_en      = Column(Text, default="")
    body_de      = Column(Text, default="")

    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), onupdate=func.now())
