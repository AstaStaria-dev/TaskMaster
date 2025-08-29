from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timedelta
from bson import ObjectId

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="TaskMaster API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Pydantic Models
class Task(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    title: str
    dueDate: str
    priority: str = Field(..., pattern="^(high|medium|low)$")
    category: str = Field(..., pattern="^(work|personal|study)$")
    completed: bool = False
    createdAt: str
    updatedAt: Optional[str] = None
    userId: Optional[str] = None  # For future multi-user support
    notificationId: Optional[str] = None

    class Config:
        allow_population_by_field_name = True
        json_encoders = {ObjectId: str}

class TaskCreate(BaseModel):
    title: str
    dueDate: str
    priority: str = Field(..., pattern="^(high|medium|low)$")
    category: str = Field(..., pattern="^(work|personal|study)$")
    notificationId: Optional[str] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    dueDate: Optional[str] = None
    priority: Optional[str] = Field(None, pattern="^(high|medium|low)$")
    category: Optional[str] = Field(None, pattern="^(work|personal|study)$")
    completed: Optional[bool] = None
    notificationId: Optional[str] = None

class SyncRequest(BaseModel):
    tasks: List[Task]
    lastSyncTime: Optional[str] = None

class SyncResponse(BaseModel):
    tasks: List[Task]
    conflicts: List[Task] = []
    syncTime: str

# Utility Functions
def task_helper(task) -> dict:
    """Convert MongoDB document to Task dict"""
    return {
        "id": str(task["_id"]),
        "title": task["title"],
        "dueDate": task["dueDate"],
        "priority": task["priority"],
        "category": task["category"],
        "completed": task["completed"],
        "createdAt": task["createdAt"],
        "updatedAt": task.get("updatedAt"),
        "userId": task.get("userId"),
        "notificationId": task.get("notificationId"),
    }

# API Routes
@api_router.get("/")
async def root():
    return {"message": "TaskMaster API v1.0.0", "status": "running"}

@api_router.get("/health")
async def health_check():
    try:
        # Test database connection
        await db.tasks.find_one()
        return {"status": "healthy", "database": "connected", "timestamp": datetime.now().isoformat()}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {str(e)}")

# Task CRUD Operations
@api_router.post("/tasks", response_model=Task)
async def create_task(task_data: TaskCreate):
    """Create a new task"""
    try:
        task_dict = task_data.dict()
        task_dict["createdAt"] = datetime.now().isoformat()
        task_dict["completed"] = False
        task_dict["updatedAt"] = datetime.now().isoformat()
        
        result = await db.tasks.insert_one(task_dict)
        created_task = await db.tasks.find_one({"_id": result.inserted_id})
        
        return Task(**task_helper(created_task))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create task: {str(e)}")

@api_router.get("/tasks", response_model=List[Task])
async def get_tasks(
    category: Optional[str] = None,
    priority: Optional[str] = None,
    completed: Optional[bool] = None,
    limit: int = 100
):
    """Get tasks with optional filtering"""
    try:
        query = {}
        
        if category and category in ["work", "personal", "study"]:
            query["category"] = category
            
        if priority and priority in ["high", "medium", "low"]:
            query["priority"] = priority
            
        if completed is not None:
            query["completed"] = completed
        
        tasks = await db.tasks.find(query).limit(limit).sort("createdAt", -1).to_list(limit)
        return [Task(**task_helper(task)) for task in tasks]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch tasks: {str(e)}")

@api_router.get("/tasks/{task_id}", response_model=Task)
async def get_task(task_id: str):
    """Get a specific task by ID"""
    try:
        if not ObjectId.is_valid(task_id):
            raise HTTPException(status_code=400, detail="Invalid task ID format")
            
        task = await db.tasks.find_one({"_id": ObjectId(task_id)})
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
            
        return Task(**task_helper(task))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch task: {str(e)}")

@api_router.put("/tasks/{task_id}", response_model=Task)
async def update_task(task_id: str, task_update: TaskUpdate):
    """Update a task"""
    try:
        if not ObjectId.is_valid(task_id):
            raise HTTPException(status_code=400, detail="Invalid task ID format")
            
        update_data = {k: v for k, v in task_update.dict().items() if v is not None}
        if not update_data:
            raise HTTPException(status_code=400, detail="No valid update data provided")
            
        update_data["updatedAt"] = datetime.now().isoformat()
        
        result = await db.tasks.update_one(
            {"_id": ObjectId(task_id)},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Task not found")
            
        updated_task = await db.tasks.find_one({"_id": ObjectId(task_id)})
        return Task(**task_helper(updated_task))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update task: {str(e)}")

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    """Delete a task"""
    try:
        if not ObjectId.is_valid(task_id):
            raise HTTPException(status_code=400, detail="Invalid task ID format")
            
        result = await db.tasks.delete_one({"_id": ObjectId(task_id)})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Task not found")
            
        return {"message": "Task deleted successfully", "taskId": task_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete task: {str(e)}")

# Bulk Operations
@api_router.post("/tasks/sync", response_model=SyncResponse)
async def sync_tasks(sync_request: SyncRequest):
    """Sync tasks between client and server"""
    try:
        current_time = datetime.now().isoformat()
        conflicts = []
        
        # For now, simply overwrite server tasks with client tasks
        # In a real app, you'd implement proper conflict resolution
        
        # Clear existing tasks (for demo purposes)
        await db.tasks.delete_many({})
        
        # Insert new tasks from client
        server_tasks = []
        for task in sync_request.tasks:
            task_dict = task.dict()
            task_dict["updatedAt"] = current_time
            
            if task.id:  # Update existing
                # Convert task id to ObjectId for MongoDB
                if ObjectId.is_valid(task.id):
                    task_dict["_id"] = ObjectId(task.id)
                else:
                    # Generate new ObjectId if invalid
                    task_dict.pop("id", None)
                    
            result = await db.tasks.insert_one(task_dict)
            created_task = await db.tasks.find_one({"_id": result.inserted_id})
            server_tasks.append(Task(**task_helper(created_task)))
        
        return SyncResponse(
            tasks=server_tasks,
            conflicts=conflicts,
            syncTime=current_time
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync tasks: {str(e)}")

@api_router.get("/stats")
async def get_stats():
    """Get comprehensive task statistics and analytics"""
    try:
        # Basic counts
        total_tasks = await db.tasks.count_documents({})
        completed_tasks = await db.tasks.count_documents({"completed": True})
        pending_tasks = total_tasks - completed_tasks
        
        # Overdue tasks (past due and not completed)
        current_time = datetime.now().isoformat()
        overdue_tasks = await db.tasks.count_documents({
            "completed": False,
            "dueDate": {"$lt": current_time}
        })
        
        # Today's tasks
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        today_end = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999).isoformat()
        today_tasks = await db.tasks.count_documents({
            "dueDate": {"$gte": today_start, "$lte": today_end}
        })
        
        # This week's tasks
        week_start = (datetime.now() - timedelta(days=datetime.now().weekday())).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        week_end = (datetime.now() + timedelta(days=6-datetime.now().weekday())).replace(hour=23, minute=59, second=59, microsecond=999999).isoformat()
        week_tasks = await db.tasks.count_documents({
            "dueDate": {"$gte": week_start, "$lte": week_end}
        })
        
        # Category breakdown
        categories = await db.tasks.aggregate([
            {"$group": {"_id": "$category", "total": {"$sum": 1}, "completed": {"$sum": {"$cond": ["$completed", 1, 0]}}}}
        ]).to_list(None)
        
        # Priority breakdown  
        priorities = await db.tasks.aggregate([
            {"$group": {"_id": "$priority", "total": {"$sum": 1}, "completed": {"$sum": {"$cond": ["$completed", 1, 0]}}}}
        ]).to_list(None)
        
        # Completion rate over time (last 7 days)
        daily_stats = []
        for i in range(7):
            date = datetime.now() - timedelta(days=i)
            day_start = date.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
            day_end = date.replace(hour=23, minute=59, second=59, microsecond=999999).isoformat()
            
            day_total = await db.tasks.count_documents({
                "createdAt": {"$gte": day_start, "$lte": day_end}
            })
            day_completed = await db.tasks.count_documents({
                "createdAt": {"$gte": day_start, "$lte": day_end},
                "completed": True
            })
            
            daily_stats.append({
                "date": date.strftime("%Y-%m-%d"),
                "day": date.strftime("%a"),
                "created": day_total,
                "completed": day_completed,
                "completionRate": (day_completed / day_total * 100) if day_total > 0 else 0
            })
        
        # Productivity insights
        completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
        
        return {
            "overview": {
                "totalTasks": total_tasks,
                "completedTasks": completed_tasks,
                "pendingTasks": pending_tasks,
                "overdueTask": overdue_tasks,
                "todayTasks": today_tasks,
                "weekTasks": week_tasks,
                "completionRate": round(completion_rate, 1)
            },
            "categoryStats": {
                item["_id"]: {
                    "total": item["total"],
                    "completed": item["completed"],
                    "pending": item["total"] - item["completed"],
                    "completionRate": round((item["completed"] / item["total"] * 100) if item["total"] > 0 else 0, 1)
                } for item in categories
            },
            "priorityStats": {
                item["_id"]: {
                    "total": item["total"], 
                    "completed": item["completed"],
                    "pending": item["total"] - item["completed"],
                    "completionRate": round((item["completed"] / item["total"] * 100) if item["total"] > 0 else 0, 1)
                } for item in priorities
            },
            "dailyTrends": list(reversed(daily_stats)),  # Most recent first
            "insights": {
                "mostProductiveCategory": max(categories, key=lambda x: x["completed"])["_id"] if categories else None,
                "leastProductiveCategory": min(categories, key=lambda x: x["completed"])["_id"] if categories else None,
                "averageTasksPerDay": round(total_tasks / 7, 1),
                "streak": 0,  # TODO: Implement streak calculation
                "productivityScore": round(completion_rate + (10 if overdue_tasks == 0 else -overdue_tasks * 2), 1)
            },
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch analytics: {str(e)}")

@api_router.get("/analytics/productivity")
async def get_productivity_analytics():
    """Get detailed productivity analytics"""
    try:
        # Weekly productivity over last 4 weeks
        weekly_stats = []
        for week in range(4):
            week_start = datetime.now() - timedelta(weeks=week, days=datetime.now().weekday())
            week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
            week_end = week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)
            
            week_tasks = await db.tasks.count_documents({
                "createdAt": {"$gte": week_start.isoformat(), "$lte": week_end.isoformat()}
            })
            week_completed = await db.tasks.count_documents({
                "createdAt": {"$gte": week_start.isoformat(), "$lte": week_end.isoformat()},
                "completed": True
            })
            
            weekly_stats.append({
                "week": f"Week {4-week}",
                "startDate": week_start.strftime("%Y-%m-%d"),
                "created": week_tasks,
                "completed": week_completed,
                "completionRate": round((week_completed / week_tasks * 100) if week_tasks > 0 else 0, 1)
            })
        
        return {
            "weeklyTrends": list(reversed(weekly_stats)),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch productivity analytics: {str(e)}")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    logger.info("TaskMaster API starting up...")
    # Create indexes for better performance
    try:
        await db.tasks.create_index([("createdAt", -1)])
        await db.tasks.create_index([("dueDate", 1)])
        await db.tasks.create_index([("category", 1)])
        await db.tasks.create_index([("priority", 1)])
        await db.tasks.create_index([("completed", 1)])
        logger.info("Database indexes created successfully")
    except Exception as e:
        logger.error(f"Failed to create indexes: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    logger.info("TaskMaster API shutting down...")
    client.close()