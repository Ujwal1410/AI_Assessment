from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..db.mongo import get_db
from ..schemas.proctor import ProctorEventIn, ProctorSummaryOut, EVENT_TYPE_LABELS
from ..utils.responses import success_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/proctor", tags=["proctor"])


@router.post("/record")
async def record_proctor_event(
    payload: ProctorEventIn,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Record a proctoring event from the browser.
    
    This endpoint receives proctoring violation events (tab switches, fullscreen exits, etc.)
    and stores them in MongoDB for later review by admins.
    """
    try:
        # Create the document to store
        proctor_event = {
            "userId": payload.userId.strip(),
            "assessmentId": payload.assessmentId.strip(),
            "eventType": payload.eventType.strip(),
            "timestamp": payload.timestamp,
            "metadata": payload.metadata,
            "snapshotBase64": payload.snapshotBase64,
            "receivedAt": datetime.now(timezone.utc).isoformat(),
        }

        # Insert into proctor_events collection
        result = await db.proctor_events.insert_one(proctor_event)
        
        # Log the event
        logger.info(
            f"[Proctor API] Event recorded: {payload.eventType} for user {payload.userId} "
            f"in assessment {payload.assessmentId} (id: {result.inserted_id})"
        )
        
        # Log if snapshot was included
        if payload.snapshotBase64:
            logger.info(f"[Proctor API] Snapshot saved for event (id: {result.inserted_id})")

        return {"status": "ok", "id": str(result.inserted_id)}
    
    except Exception as exc:
        logger.exception(f"[Proctor] Error recording event: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record proctoring event: {str(exc)}"
        ) from exc


@router.get("/summary/{assessmentId}/{userId}")
async def get_proctor_summary(
    assessmentId: str,
    userId: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Get proctoring violation summary for a specific candidate in an assessment.
    
    Returns:
    - summary: Count of each event type
    - totalViolations: Total number of violations
    - violations: List of all violation documents
    """
    try:
        # Query all events for this user and assessment
        query = {
            "assessmentId": assessmentId.strip(),
            "userId": userId.strip(),
        }
        
        cursor = db.proctor_events.find(query).sort("timestamp", 1)
        violations = []
        
        async for doc in cursor:
            # Convert ObjectId to string for JSON serialization
            doc["_id"] = str(doc["_id"])
            violations.append(doc)
        
        # Aggregate counts by event type
        summary: Dict[str, int] = {}
        for violation in violations:
            event_type = violation.get("eventType", "UNKNOWN")
            summary[event_type] = summary.get(event_type, 0) + 1
        
        total_violations = len(violations)
        
        logger.info(
            f"[Proctor] Summary fetched for user {userId} in assessment {assessmentId}: "
            f"{total_violations} total violations"
        )

        return success_response(
            "Proctoring summary fetched successfully",
            {
                "summary": summary,
                "totalViolations": total_violations,
                "violations": violations,
                "eventTypeLabels": EVENT_TYPE_LABELS,
            }
        )
    
    except Exception as exc:
        logger.exception(f"[Proctor] Error fetching summary: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch proctoring summary: {str(exc)}"
        ) from exc


@router.get("/logs/{assessmentId}/{userId}")
async def get_proctor_logs(
    assessmentId: str,
    userId: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Get full proctoring logs for a specific candidate in an assessment.
    Returns all violation documents with metadata and snapshotBase64 for evidence gallery.
    
    Returns:
    - logs: List of all violation documents sorted by timestamp (newest first)
    - totalCount: Total number of logs
    """
    try:
        # Query all events for this user and assessment, sorted newest first
        query = {
            "assessmentId": assessmentId.strip(),
            "userId": userId.strip(),
        }
        
        cursor = db.proctor_events.find(query).sort("timestamp", -1)
        logs = []
        
        async for doc in cursor:
            # Convert ObjectId to string for JSON serialization
            doc["_id"] = str(doc["_id"])
            logs.append(doc)
        
        logger.info(
            f"[Proctor API] Logs fetched for user {userId} in assessment {assessmentId}: "
            f"{len(logs)} total logs"
        )

        return success_response(
            "Proctoring logs fetched successfully",
            {
                "logs": logs,
                "totalCount": len(logs),
                "eventTypeLabels": EVENT_TYPE_LABELS,
            }
        )
    
    except Exception as exc:
        logger.exception(f"[Proctor API] Error fetching logs: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch proctoring logs: {str(exc)}"
        ) from exc


@router.get("/assessment/{assessmentId}/all")
async def get_all_proctor_events_for_assessment(
    assessmentId: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Get all proctoring events for an assessment, grouped by user.
    
    Returns a dictionary where keys are userIds and values contain
    their violation summary and details.
    """
    try:
        # Query all events for this assessment
        query = {"assessmentId": assessmentId.strip()}
        
        cursor = db.proctor_events.find(query).sort("timestamp", 1)
        
        # Group by user
        users_data: Dict[str, Dict[str, Any]] = {}
        
        async for doc in cursor:
            user_id = doc.get("userId", "unknown")
            doc["_id"] = str(doc["_id"])
            
            if user_id not in users_data:
                users_data[user_id] = {
                    "violations": [],
                    "summary": {},
                    "totalViolations": 0,
                }
            
            users_data[user_id]["violations"].append(doc)
            event_type = doc.get("eventType", "UNKNOWN")
            users_data[user_id]["summary"][event_type] = users_data[user_id]["summary"].get(event_type, 0) + 1
            users_data[user_id]["totalViolations"] += 1
        
        logger.info(
            f"[Proctor API] All events fetched for assessment {assessmentId}: "
            f"{len(users_data)} users with violations"
        )

        return success_response(
            "All proctoring events fetched successfully",
            {
                "users": users_data,
                "eventTypeLabels": EVENT_TYPE_LABELS,
            }
        )
    
    except Exception as exc:
        logger.exception(f"[Proctor API] Error fetching all events: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch proctoring events: {str(exc)}"
        ) from exc

