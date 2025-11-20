from __future__ import annotations

import html
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..db.mongo import get_db
from ..schemas.assessment import LogAnswerRequest
from ..utils.mongo import to_object_id
from ..utils.responses import success_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/assessment", tags=["candidate"])


def _check_assessment_time_window(assessment: Dict[str, Any], allow_before_start: bool = False) -> None:
    """
    Check if current time is within the assessment's allowed time window.
    
    Args:
        assessment: The assessment document from database
        allow_before_start: If True, allow access before startTime (e.g., for checking schedule)
    
    Raises:
        HTTPException: If current time is outside the allowed window
    """
    schedule = assessment.get("schedule", {})
    start_time_str = schedule.get("startTime")
    end_time_str = schedule.get("endTime")
    
    # If no schedule is set, allow access (backward compatibility)
    if not start_time_str or not end_time_str:
        return
    
    try:
        # Parse ISO format datetime strings
        start_time = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
        end_time = datetime.fromisoformat(end_time_str.replace("Z", "+00:00"))
        
        # Ensure timezone-aware comparison
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)
        
        now = datetime.now(timezone.utc)
        
        # Check if before start time
        if now < start_time:
            if allow_before_start:
                return  # Allow access before start (e.g., for checking schedule)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Assessment has not started yet. It will start at {start_time_str}"
            )
        
        # Check if after end time
        if now > end_time:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Assessment has ended. It ended at {end_time_str}"
            )
    except (ValueError, AttributeError) as exc:
        # If date parsing fails, log warning but don't block access (backward compatibility)
        logger.warning(f"Failed to parse assessment schedule times: {exc}")
        return


@router.post("/verify-candidate")
async def verify_candidate(
    payload: Dict[str, Any],
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Verify candidate email and name against assessment candidates list."""
    assessment_id = payload.get("assessmentId")
    token = payload.get("token")
    email = payload.get("email", "").strip().lower()
    name = payload.get("name", "").strip()

    if not assessment_id or not token or not email or not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing required fields")

    try:
        oid = to_object_id(assessment_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assessment ID")

    assessment = await db.assessments.find_one({"_id": oid})
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

    # Verify token
    if assessment.get("assessmentToken") != token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid assessment token")

    # Verify candidate
    candidates = assessment.get("candidates", [])
    candidate_found = any(
        c.get("email", "").strip().lower() == email and c.get("name", "").strip() == name
        for c in candidates
    )

    if not candidate_found:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email and name combination not found in candidate list")

    # Check time window (allow before start so candidates can verify and see schedule)
    _check_assessment_time_window(assessment, allow_before_start=True)

    return success_response("Candidate verified successfully", {"verified": True})


@router.get("/get-schedule")
async def get_assessment_schedule(
    assessmentId: str = Query(...),
    token: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get assessment schedule for candidates."""
    try:
        oid = to_object_id(assessmentId)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assessment ID")

    assessment = await db.assessments.find_one({"_id": oid})
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

    # Verify token
    if assessment.get("assessmentToken") != token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid assessment token")

    # Check time window (allow before start so candidates can check schedule)
    _check_assessment_time_window(assessment, allow_before_start=True)

    schedule = assessment.get("schedule", {})
    return success_response(
        "Schedule fetched successfully",
        {
            "startTime": schedule.get("startTime"),
            "endTime": schedule.get("endTime"),
            "timezone": schedule.get("timezone", "Asia/Kolkata"),
        }
    )


@router.get("/get-questions")
async def get_assessment_questions(
    assessmentId: str = Query(...),
    token: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get assessment questions for candidates."""
    try:
        oid = to_object_id(assessmentId)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assessment ID")

    assessment = await db.assessments.find_one({"_id": oid})
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

    # Verify token
    if assessment.get("assessmentToken") != token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid assessment token")

    # Check time window (strict - must be within start and end time)
    _check_assessment_time_window(assessment, allow_before_start=False)

    # Collect all questions from all topics
    all_questions = []
    for topic in assessment.get("topics", []):
        topic_questions = topic.get("questions", [])
        for question in topic_questions:
            all_questions.append(question)

    # Get questionTypeTimes and enablePerSectionTimers from assessment
    question_type_times = assessment.get("questionTypeTimes", {})
    enable_per_section_timers = assessment.get("enablePerSectionTimers", True)  # Default to True for backward compatibility
    
    return success_response(
        "Questions fetched successfully",
        {
            "questions": all_questions,
            "questionTypeTimes": question_type_times,
            "enablePerSectionTimers": enable_per_section_timers,
        }
    )


@router.post("/log-answer")
async def log_candidate_answer(
    payload: LogAnswerRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Log candidate answer change for non-MCQ questions."""
    try:
        # Sanitize and validate input
        email = payload.email.strip().lower()
        name = payload.name.strip()
        answer = html.escape(payload.answer.strip())  # Sanitize HTML to prevent XSS
        
        if not email or not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email and name are required")
        
        if len(answer) > 50000:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Answer text exceeds maximum length of 50,000 characters")

        try:
            oid = to_object_id(payload.assessmentId)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assessment ID")

        assessment = await db.assessments.find_one({"_id": oid})
        if not assessment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

        # Verify token
        if assessment.get("assessmentToken") != payload.token:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid assessment token")

        # Verify candidate
        candidates = assessment.get("candidates", [])
        candidate_found = any(
            c.get("email", "").strip().lower() == email and c.get("name", "").strip() == name
            for c in candidates
        )
        if not candidate_found:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidate not found")

        # Check time window (strict - must be within start and end time)
        _check_assessment_time_window(assessment, allow_before_start=False)

        candidate_key = f"{email}_{name}"
        question_key = str(payload.questionIndex)

        # Get current version count for this question
        current_logs = assessment.get("answerLogs", {})
        candidate_logs = current_logs.get(candidate_key, {})
        question_logs = candidate_logs.get(question_key, [])
        next_version = len(question_logs) + 1

        # Create log entry
        log_entry = {
            "answer": answer,
            "questionType": payload.questionType,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version": next_version,
        }

        # Use atomic $push operation to append log entry
        # This ensures no race conditions and doesn't require replacing the entire document
        update_path = f"answerLogs.{candidate_key}.{question_key}"
        
        # Build the query filter for checking if path exists
        filter_dict = {"_id": oid}
        filter_dict[update_path] = {"$exists": True}
        
        # Try to push to existing array atomically
        update_result = await db.assessments.update_one(
            filter_dict,
            {
                "$push": {
                    update_path: log_entry
                }
            }
        )

        # If the path doesn't exist, set it with the first entry
        if update_result.matched_count == 0:
            set_dict = {"_id": oid}
            set_update = {"$set": {}}
            set_update["$set"][update_path] = [log_entry]
            await db.assessments.update_one(
                set_dict,
                set_update
            )

        logger.info(f"Answer logged for candidate {email}, question {payload.questionIndex}, version {next_version}")

        return success_response(
            "Answer logged successfully",
            {
                "questionIndex": payload.questionIndex,
                "version": next_version,
                "timestamp": log_entry["timestamp"],
            }
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"Error logging answer: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to log answer. Please try again.",
        ) from exc


@router.post("/submit-answers")
async def submit_candidate_answers(
    payload: Dict[str, Any],
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Submit candidate answers and calculate score."""
    assessment_id = payload.get("assessmentId")
    token = payload.get("token")
    email = payload.get("email", "").strip().lower()
    name = payload.get("name", "").strip()
    answers = payload.get("answers", [])
    skipped_questions = payload.get("skippedQuestions", [])

    if not assessment_id or not token or not email or not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing required fields")

    try:
        oid = to_object_id(assessment_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assessment ID")

    assessment = await db.assessments.find_one({"_id": oid})
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

    # Verify token
    if assessment.get("assessmentToken") != token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid assessment token")

    # Verify candidate
    candidates = assessment.get("candidates", [])
    candidate_found = any(
        c.get("email", "").strip().lower() == email and c.get("name", "").strip() == name
        for c in candidates
    )
    if not candidate_found:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidate not found")

    # Check time window (strict - must be within start and end time)
    # Note: We allow submission even slightly after endTime to handle auto-submissions
    # But we still check to prevent submissions way after the deadline
    schedule = assessment.get("schedule", {})
    start_time_str = schedule.get("startTime")
    end_time_str = schedule.get("endTime")
    
    if start_time_str and end_time_str:
        try:
            start_time = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
            end_time = datetime.fromisoformat(end_time_str.replace("Z", "+00:00"))
            
            if start_time.tzinfo is None:
                start_time = start_time.replace(tzinfo=timezone.utc)
            if end_time.tzinfo is None:
                end_time = end_time.replace(tzinfo=timezone.utc)
            
            now = datetime.now(timezone.utc)
            
            if now < start_time:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Assessment has not started yet. It will start at {start_time_str}"
                )
            
            # Allow 2 minutes grace period after endTime for auto-submissions
            grace_period_seconds = 120
            if now > end_time:
                time_after_end = (now - end_time).total_seconds()
                if time_after_end > grace_period_seconds:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Assessment has ended. It ended at {end_time_str}. Submission deadline has passed."
                    )
        except (ValueError, AttributeError) as exc:
            logger.warning(f"Failed to parse assessment schedule times for submission: {exc}")

    # Collect all questions
    all_questions = []
    for topic in assessment.get("topics", []):
        topic_questions = topic.get("questions", [])
        for question in topic_questions:
            all_questions.append(question)

    # Calculate score
    total_score = 0
    max_score = 0
    correct_answers = 0
    attempted = len(answers)
    not_attempted = len(all_questions) - attempted - len(skipped_questions)

    for idx, question in enumerate(all_questions):
        max_score += question.get("score", 5)
        answer_obj = next((a for a in answers if a.get("questionIndex") == idx), None)
        
        if answer_obj:
            if question.get("type") == "MCQ":
                if answer_obj.get("answer") == question.get("correctAnswer"):
                    total_score += question.get("score", 5)
                    correct_answers += 1
            # For subjective/descriptive, we'll need manual evaluation later
            # For now, just mark as attempted

    # Store candidate response
    candidate_responses = assessment.get("candidateResponses", {})
    candidate_key = f"{email}_{name}"
    candidate_responses[candidate_key] = {
        "email": email,
        "name": name,
        "answers": answers,
        "skippedQuestions": skipped_questions,
        "score": total_score,
        "maxScore": max_score,
        "attempted": attempted,
        "notAttempted": not_attempted,
        "correctAnswers": correct_answers,
        "submittedAt": datetime.now(timezone.utc).isoformat(),
    }
    assessment["candidateResponses"] = candidate_responses
    await db.assessments.replace_one({"_id": oid}, assessment)

    return success_response(
        "Answers submitted successfully",
        {
            "score": total_score,
            "maxScore": max_score,
            "attempted": attempted,
            "notAttempted": not_attempted,
            "correctAnswers": correct_answers,
        }
    )

