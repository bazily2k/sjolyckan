"""
Uppdaterade CMS-modeller med stöd för flera bilder per rum.
Ersätter backend/app/models/cms_models.py
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.models import Base


class Room(Base):
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True)
    name_sv = Column(String(200), nullable=False)
    name_en = Column(String(200), nullable=False)
    name_de = Column(String(200), nullable=False)
    desc_sv = Column(Text)
    desc_en = Column(Text)
    desc_de = Column(Text)
    beds_sv = Column(String(200))
    beds_en = Column(String(200))
    beds_de = Column(String(200))
    image_path = Column(String(500))        # Huvudbild (thumbnail)
    sort_order = Column(Integer, default=0)
    visible = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    images = relationship("RoomImage", back_populates="room", cascade="all, delete-orphan", order_by="RoomImage.sort_order")


class RoomImage(Base):
    """Extra bilder per rum."""
    __tablename__ = "room_images"

    id = Column(Integer, primary_key=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=False)
    image_path = Column(String(500), nullable=False)
    caption_sv = Column(String(300))
    caption_en = Column(String(300))
    caption_de = Column(String(300))
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    room = relationship("Room", back_populates="images")


class GalleryImage(Base):
    __tablename__ = "gallery_images"

    id = Column(Integer, primary_key=True)
    filename = Column(String(500), nullable=False)
    image_path = Column(String(500), nullable=False)
    alt_sv = Column(String(300))
    alt_en = Column(String(300))
    alt_de = Column(String(300))
    use_in_hero = Column(Boolean, default=True)
    use_in_gallery = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    visible = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ContentBlock(Base):
    __tablename__ = "content_blocks"

    id = Column(Integer, primary_key=True)
    key = Column(String(100), unique=True, nullable=False)
    value_sv = Column(Text)
    value_en = Column(Text)
    value_de = Column(Text)
    description = Column(String(300))
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Amenity(Base):
    __tablename__ = "amenities"

    id = Column(Integer, primary_key=True)
    icon = Column(String(20))                 # emoji
    label_sv = Column(String(200), nullable=False)
    label_en = Column(String(200), nullable=False)
    label_de = Column(String(200), nullable=False)
    sort_order = Column(Integer, default=0)
    visible = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class HouseRule(Base):
    __tablename__ = "house_rules"

    id = Column(Integer, primary_key=True)
    label_sv = Column(String(400), nullable=False)
    label_en = Column(String(400), nullable=False)
    label_de = Column(String(400), nullable=False)
    sort_order = Column(Integer, default=0)
    visible = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
