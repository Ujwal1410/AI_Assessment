from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


QUESTION_TYPES = {"MCQ", "Subjective", "Pseudo Code", "Descriptive", "Aptitude", "Reasoning"}
DIFFICULTY_LEVELS = {"Easy", "Medium", "Hard"}
STATUS_VALUES = {"draft", "ready", "scheduled", "active", "completed"}


class QuestionConfig(BaseModel):
    questionNumber: int = Field(..., ge=1)
    type: str = Field(...)
    difficulty: str = Field(default="Medium")

    def model_post_init(self, __context: dict[str, object]) -> None:
        if self.type not in QUESTION_TYPES:
            raise ValueError("Invalid question type")
        if self.difficulty not in DIFFICULTY_LEVELS:
            raise ValueError("Invalid difficulty level")


class Question(BaseModel):
    questionText: str
    type: str
    difficulty: str
    options: Optional[List[str]] = None
    correctAnswer: Optional[str] = None
    idealAnswer: Optional[str] = None
    expectedLogic: Optional[str] = None
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None


class TopicUpdate(BaseModel):
    topic: str
    numQuestions: Optional[int] = None
    questionTypes: Optional[List[str]] = None
    difficulty: Optional[str] = None
    questions: Optional[List[Question]] = None
    questionConfigs: Optional[List[QuestionConfig]] = None


class GenerateTopicsRequest(BaseModel):
    jobRole: str
    experience: str
    skills: List[str]


class UpdateTopicSettingsRequest(BaseModel):
    assessmentId: str
    updatedTopics: List[TopicUpdate]


class AddCustomTopicsRequest(BaseModel):
    assessmentId: str
    newTopics: List[TopicUpdate | str]


class RemoveCustomTopicsRequest(BaseModel):
    assessmentId: str
    topicsToRemove: List[str]


class GenerateQuestionsRequest(BaseModel):
    assessmentId: str


class UpdateQuestionsRequest(BaseModel):
    assessmentId: str
    topic: str
    updatedQuestions: List[Question]


class UpdateSingleQuestionRequest(BaseModel):
    assessmentId: str
    topic: str
    questionIndex: int = Field(..., ge=0)
    updatedQuestion: Question


class AddNewQuestionRequest(BaseModel):
    assessmentId: str
    topic: str
    newQuestion: Question


class DeleteQuestionRequest(BaseModel):
    assessmentId: str
    topic: str
    questionIndex: int = Field(..., ge=0)


class FinalizeAssessmentRequest(BaseModel):
    assessmentId: str
    title: Optional[str] = None
    description: Optional[str] = None


class ScheduleCandidateQuestions(BaseModel):
    allowed: bool = True
    maxQuestions: int = 3
    timeLimit: int = 5
    questions: List[dict] = Field(default_factory=list)


class ProctoringOptions(BaseModel):
    enabled: bool = False
    webcamRequired: bool = False
    screenRecording: bool = False
    browserLock: bool = False
    fullScreenMode: bool = False


class ScheduleUpdateRequest(BaseModel):
    startTime: datetime
    endTime: datetime
    duration: int = Field(..., gt=0)
    durationUnit: Optional[str] = Field(default="hours")
    attemptCount: Optional[int] = Field(default=1, ge=1)
    proctoringOptions: Optional[ProctoringOptions] = None
    vpnRequired: Optional[bool] = False
    linkSharingEnabled: Optional[bool] = False
    mailFeedbackReport: Optional[bool] = False
    candidateQuestions: Optional[ScheduleCandidateQuestions] = None
    instructions: Optional[str] = None
    timezone: Optional[str] = Field(default="UTC")
    isActive: Optional[bool] = False


class AssessmentScheduleUpdateRequest(BaseModel):
    assessmentId: str
    schedule: ScheduleUpdateRequest
