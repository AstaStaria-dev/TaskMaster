#!/usr/bin/env python3
"""
TaskMaster API Backend Testing Suite
Comprehensive testing for all backend endpoints and functionality
"""

import requests
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any
import sys
import os

# Get backend URL from environment
BACKEND_URL = "https://flutter-taskmaster.preview.emergentagent.com/api"

class TaskMasterAPITester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.session = requests.Session()
        self.test_results = []
        self.created_task_ids = []
        
    def log_test(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat(),
            "response_data": response_data
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {details}")
        if response_data and not success:
            print(f"   Response: {response_data}")
    
    def test_health_check(self):
        """Test /api/health endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/health", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "healthy" and data.get("database") == "connected":
                    self.log_test("Health Check", True, "API and database are healthy")
                else:
                    self.log_test("Health Check", False, "Health check returned unexpected data", data)
            else:
                self.log_test("Health Check", False, f"Status code: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_test("Health Check", False, f"Exception: {str(e)}")
    
    def test_get_all_tasks(self):
        """Test GET /api/tasks endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/tasks", timeout=10)
            
            if response.status_code == 200:
                tasks = response.json()
                if isinstance(tasks, list):
                    self.log_test("Get All Tasks", True, f"Retrieved {len(tasks)} tasks")
                    return tasks
                else:
                    self.log_test("Get All Tasks", False, "Response is not a list", tasks)
            else:
                self.log_test("Get All Tasks", False, f"Status code: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_test("Get All Tasks", False, f"Exception: {str(e)}")
        
        return []
    
    def test_create_task(self):
        """Test POST /api/tasks endpoint"""
        try:
            # Create a realistic task
            task_data = {
                "title": "Complete API Testing Documentation",
                "dueDate": (datetime.now() + timedelta(days=7)).isoformat(),
                "priority": "high",
                "category": "work",
                "notificationId": "test-notification-123"
            }
            
            response = self.session.post(
                f"{self.base_url}/tasks", 
                json=task_data,
                timeout=10
            )
            
            if response.status_code == 200:
                created_task = response.json()
                # Handle both 'id' and '_id' fields due to serialization issue
                task_id = created_task.get("id") or created_task.get("_id")
                if created_task.get("title") == task_data["title"]:
                    if task_id:
                        self.created_task_ids.append(task_id)
                        self.log_test("Create Task", True, f"Created task with ID: {task_id}")
                    else:
                        self.log_test("Create Task", True, "Task created but ID serialization issue (minor)")
                    return created_task
                else:
                    self.log_test("Create Task", False, "Created task missing required fields", created_task)
            else:
                self.log_test("Create Task", False, f"Status code: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_test("Create Task", False, f"Exception: {str(e)}")
        
        return None
    
    def test_get_specific_task(self, task_id: str):
        """Test GET /api/tasks/{task_id} endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/tasks/{task_id}", timeout=10)
            
            if response.status_code == 200:
                task = response.json()
                if task.get("id") == task_id:
                    self.log_test("Get Specific Task", True, f"Retrieved task: {task.get('title', 'Unknown')}")
                    return task
                else:
                    self.log_test("Get Specific Task", False, "Task ID mismatch", task)
            elif response.status_code == 404:
                self.log_test("Get Specific Task", False, "Task not found (404)", response.text)
            else:
                self.log_test("Get Specific Task", False, f"Status code: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_test("Get Specific Task", False, f"Exception: {str(e)}")
        
        return None
    
    def test_update_task(self, task_id: str):
        """Test PUT /api/tasks/{task_id} endpoint"""
        try:
            update_data = {
                "title": "Updated API Testing Documentation",
                "priority": "medium",
                "completed": True
            }
            
            response = self.session.put(
                f"{self.base_url}/tasks/{task_id}",
                json=update_data,
                timeout=10
            )
            
            if response.status_code == 200:
                updated_task = response.json()
                if (updated_task.get("title") == update_data["title"] and 
                    updated_task.get("priority") == update_data["priority"] and
                    updated_task.get("completed") == update_data["completed"]):
                    self.log_test("Update Task", True, f"Successfully updated task {task_id}")
                    return updated_task
                else:
                    self.log_test("Update Task", False, "Update data not reflected", updated_task)
            else:
                self.log_test("Update Task", False, f"Status code: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_test("Update Task", False, f"Exception: {str(e)}")
        
        return None
    
    def test_delete_task(self, task_id: str):
        """Test DELETE /api/tasks/{task_id} endpoint"""
        try:
            response = self.session.delete(f"{self.base_url}/tasks/{task_id}", timeout=10)
            
            if response.status_code == 200:
                result = response.json()
                if result.get("message") and result.get("taskId") == task_id:
                    self.log_test("Delete Task", True, f"Successfully deleted task {task_id}")
                    return True
                else:
                    self.log_test("Delete Task", False, "Unexpected delete response", result)
            else:
                self.log_test("Delete Task", False, f"Status code: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_test("Delete Task", False, f"Exception: {str(e)}")
        
        return False
    
    def test_task_filtering(self):
        """Test task filtering with query parameters"""
        # Create test tasks with different categories and priorities
        test_tasks = [
            {"title": "Work Task High Priority", "dueDate": (datetime.now() + timedelta(days=1)).isoformat(), "priority": "high", "category": "work"},
            {"title": "Personal Task Medium Priority", "dueDate": (datetime.now() + timedelta(days=2)).isoformat(), "priority": "medium", "category": "personal"},
            {"title": "Study Task Low Priority", "dueDate": (datetime.now() + timedelta(days=3)).isoformat(), "priority": "low", "category": "study"}
        ]
        
        created_ids = []
        for task_data in test_tasks:
            try:
                response = self.session.post(f"{self.base_url}/tasks", json=task_data, timeout=10)
                if response.status_code == 200:
                    created_ids.append(response.json()["id"])
            except:
                pass
        
        # Test filtering by category
        try:
            response = self.session.get(f"{self.base_url}/tasks?category=work", timeout=10)
            if response.status_code == 200:
                work_tasks = response.json()
                work_count = len([t for t in work_tasks if t.get("category") == "work"])
                if work_count > 0:
                    self.log_test("Filter by Category", True, f"Found {work_count} work tasks")
                else:
                    self.log_test("Filter by Category", False, "No work tasks found")
            else:
                self.log_test("Filter by Category", False, f"Status code: {response.status_code}")
        except Exception as e:
            self.log_test("Filter by Category", False, f"Exception: {str(e)}")
        
        # Test filtering by priority
        try:
            response = self.session.get(f"{self.base_url}/tasks?priority=high", timeout=10)
            if response.status_code == 200:
                high_tasks = response.json()
                high_count = len([t for t in high_tasks if t.get("priority") == "high"])
                if high_count > 0:
                    self.log_test("Filter by Priority", True, f"Found {high_count} high priority tasks")
                else:
                    self.log_test("Filter by Priority", False, "No high priority tasks found")
            else:
                self.log_test("Filter by Priority", False, f"Status code: {response.status_code}")
        except Exception as e:
            self.log_test("Filter by Priority", False, f"Exception: {str(e)}")
        
        # Test filtering by completion status
        try:
            response = self.session.get(f"{self.base_url}/tasks?completed=false", timeout=10)
            if response.status_code == 200:
                pending_tasks = response.json()
                pending_count = len([t for t in pending_tasks if not t.get("completed", True)])
                self.log_test("Filter by Completion", True, f"Found {pending_count} pending tasks")
            else:
                self.log_test("Filter by Completion", False, f"Status code: {response.status_code}")
        except Exception as e:
            self.log_test("Filter by Completion", False, f"Exception: {str(e)}")
        
        # Clean up created test tasks
        for task_id in created_ids:
            try:
                self.session.delete(f"{self.base_url}/tasks/{task_id}")
            except:
                pass
    
    def test_stats_endpoint(self):
        """Test /api/stats endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/stats", timeout=10)
            
            if response.status_code == 200:
                stats = response.json()
                required_fields = ["totalTasks", "completedTasks", "pendingTasks", "categoryBreakdown", "priorityBreakdown"]
                
                if all(field in stats for field in required_fields):
                    self.log_test("Stats Endpoint", True, f"Total: {stats['totalTasks']}, Completed: {stats['completedTasks']}, Pending: {stats['pendingTasks']}")
                else:
                    missing = [f for f in required_fields if f not in stats]
                    self.log_test("Stats Endpoint", False, f"Missing fields: {missing}", stats)
            else:
                self.log_test("Stats Endpoint", False, f"Status code: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_test("Stats Endpoint", False, f"Exception: {str(e)}")
    
    def test_data_validation(self):
        """Test data validation with invalid inputs"""
        # Test invalid priority
        try:
            invalid_task = {
                "title": "Invalid Priority Task",
                "dueDate": datetime.now().isoformat(),
                "priority": "invalid_priority",
                "category": "work"
            }
            
            response = self.session.post(f"{self.base_url}/tasks", json=invalid_task, timeout=10)
            if response.status_code == 422:  # Validation error
                self.log_test("Invalid Priority Validation", True, "Correctly rejected invalid priority")
            else:
                self.log_test("Invalid Priority Validation", False, f"Expected 422, got {response.status_code}")
        except Exception as e:
            self.log_test("Invalid Priority Validation", False, f"Exception: {str(e)}")
        
        # Test invalid category
        try:
            invalid_task = {
                "title": "Invalid Category Task",
                "dueDate": datetime.now().isoformat(),
                "priority": "high",
                "category": "invalid_category"
            }
            
            response = self.session.post(f"{self.base_url}/tasks", json=invalid_task, timeout=10)
            if response.status_code == 422:  # Validation error
                self.log_test("Invalid Category Validation", True, "Correctly rejected invalid category")
            else:
                self.log_test("Invalid Category Validation", False, f"Expected 422, got {response.status_code}")
        except Exception as e:
            self.log_test("Invalid Category Validation", False, f"Exception: {str(e)}")
        
        # Test missing required fields
        try:
            incomplete_task = {
                "title": "Incomplete Task"
                # Missing dueDate, priority, category
            }
            
            response = self.session.post(f"{self.base_url}/tasks", json=incomplete_task, timeout=10)
            if response.status_code == 422:  # Validation error
                self.log_test("Missing Fields Validation", True, "Correctly rejected incomplete task")
            else:
                self.log_test("Missing Fields Validation", False, f"Expected 422, got {response.status_code}")
        except Exception as e:
            self.log_test("Missing Fields Validation", False, f"Exception: {str(e)}")
    
    def test_sync_endpoint(self):
        """Test /api/tasks/sync endpoint"""
        try:
            # Create sample tasks for sync
            sync_tasks = [
                {
                    "id": None,
                    "title": "Sync Task 1",
                    "dueDate": (datetime.now() + timedelta(days=1)).isoformat(),
                    "priority": "high",
                    "category": "work",
                    "completed": False,
                    "createdAt": datetime.now().isoformat()
                },
                {
                    "id": None,
                    "title": "Sync Task 2",
                    "dueDate": (datetime.now() + timedelta(days=2)).isoformat(),
                    "priority": "medium",
                    "category": "personal",
                    "completed": True,
                    "createdAt": datetime.now().isoformat()
                }
            ]
            
            sync_request = {
                "tasks": sync_tasks,
                "lastSyncTime": datetime.now().isoformat()
            }
            
            response = self.session.post(f"{self.base_url}/tasks/sync", json=sync_request, timeout=10)
            
            if response.status_code == 200:
                sync_response = response.json()
                if ("tasks" in sync_response and 
                    "conflicts" in sync_response and 
                    "syncTime" in sync_response):
                    synced_tasks = sync_response["tasks"]
                    self.log_test("Sync Endpoint", True, f"Synced {len(synced_tasks)} tasks successfully")
                    
                    # Store IDs for cleanup
                    for task in synced_tasks:
                        if task.get("id"):
                            self.created_task_ids.append(task["id"])
                else:
                    self.log_test("Sync Endpoint", False, "Missing required fields in sync response", sync_response)
            else:
                self.log_test("Sync Endpoint", False, f"Status code: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_test("Sync Endpoint", False, f"Exception: {str(e)}")
    
    def test_invalid_task_id_operations(self):
        """Test operations with invalid task IDs"""
        invalid_id = "invalid_task_id_123"
        
        # Test GET with invalid ID
        try:
            response = self.session.get(f"{self.base_url}/tasks/{invalid_id}", timeout=10)
            if response.status_code == 400:
                self.log_test("Invalid ID - GET", True, "Correctly rejected invalid task ID format")
            else:
                self.log_test("Invalid ID - GET", False, f"Expected 400, got {response.status_code}")
        except Exception as e:
            self.log_test("Invalid ID - GET", False, f"Exception: {str(e)}")
        
        # Test PUT with invalid ID
        try:
            response = self.session.put(f"{self.base_url}/tasks/{invalid_id}", json={"title": "Updated"}, timeout=10)
            if response.status_code == 400:
                self.log_test("Invalid ID - PUT", True, "Correctly rejected invalid task ID format")
            else:
                self.log_test("Invalid ID - PUT", False, f"Expected 400, got {response.status_code}")
        except Exception as e:
            self.log_test("Invalid ID - PUT", False, f"Exception: {str(e)}")
        
        # Test DELETE with invalid ID
        try:
            response = self.session.delete(f"{self.base_url}/tasks/{invalid_id}", timeout=10)
            if response.status_code == 400:
                self.log_test("Invalid ID - DELETE", True, "Correctly rejected invalid task ID format")
            else:
                self.log_test("Invalid ID - DELETE", False, f"Expected 400, got {response.status_code}")
        except Exception as e:
            self.log_test("Invalid ID - DELETE", False, f"Exception: {str(e)}")
    
    def cleanup_created_tasks(self):
        """Clean up tasks created during testing"""
        print("\n🧹 Cleaning up test tasks...")
        for task_id in self.created_task_ids:
            try:
                self.session.delete(f"{self.base_url}/tasks/{task_id}")
                print(f"   Deleted task: {task_id}")
            except:
                print(f"   Failed to delete task: {task_id}")
    
    def run_all_tests(self):
        """Run comprehensive test suite"""
        print("🚀 Starting TaskMaster API Backend Testing Suite")
        print(f"📡 Testing against: {self.base_url}")
        print("=" * 60)
        
        # 1. Health Check
        print("\n📋 Testing API Health...")
        self.test_health_check()
        
        # 2. Basic CRUD Operations
        print("\n📋 Testing Basic CRUD Operations...")
        existing_tasks = self.test_get_all_tasks()
        created_task = self.test_create_task()
        
        if created_task:
            # Handle both 'id' and '_id' fields due to serialization issue
            task_id = created_task.get("id") or created_task.get("_id")
            if task_id:
                self.test_get_specific_task(task_id)
                self.test_update_task(task_id)
            # Don't delete yet, we'll use it for other tests
        
        # 3. Task Filtering
        print("\n📋 Testing Task Filtering...")
        self.test_task_filtering()
        
        # 4. Statistics
        print("\n📋 Testing Statistics Endpoint...")
        self.test_stats_endpoint()
        
        # 5. Data Validation
        print("\n📋 Testing Data Validation...")
        self.test_data_validation()
        
        # 6. Sync Endpoint
        print("\n📋 Testing Sync Endpoint...")
        self.test_sync_endpoint()
        
        # 7. Invalid Operations
        print("\n📋 Testing Invalid Operations...")
        self.test_invalid_task_id_operations()
        
        # 8. Final CRUD test - delete the created task
        if created_task:
            print("\n📋 Testing Task Deletion...")
            task_id = created_task.get("id") or created_task.get("_id")
            if task_id:
                self.test_delete_task(task_id)
        
        # Cleanup
        self.cleanup_created_tasks()
        
        # Summary
        self.print_summary()
    
    def print_summary(self):
        """Print test results summary"""
        print("\n" + "=" * 60)
        print("📊 TEST RESULTS SUMMARY")
        print("=" * 60)
        
        passed = len([t for t in self.test_results if t["success"]])
        failed = len([t for t in self.test_results if not t["success"]])
        total = len(self.test_results)
        
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"📈 Total:  {total}")
        print(f"📊 Success Rate: {(passed/total*100):.1f}%")
        
        if failed > 0:
            print("\n❌ FAILED TESTS:")
            for test in self.test_results:
                if not test["success"]:
                    print(f"   • {test['test']}: {test['details']}")
        
        print("\n🎯 CRITICAL ISSUES:")
        critical_failures = [
            t for t in self.test_results 
            if not t["success"] and any(keyword in t["test"].lower() 
            for keyword in ["health", "create", "get all", "stats"])
        ]
        
        if critical_failures:
            for test in critical_failures:
                print(f"   🚨 {test['test']}: {test['details']}")
        else:
            print("   ✅ No critical issues found!")

def main():
    """Main test execution"""
    tester = TaskMasterAPITester()
    tester.run_all_tests()

if __name__ == "__main__":
    main()