import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  Platform,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { format, isToday, isTomorrow, isPast, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, startOfMonth, endOfMonth, addMonths, subMonths, isSameDay, parseISO } from 'date-fns';
import { Calendar } from 'react-native-calendars';
import { BarChart, LineChart, PieChart } from 'react-native-chart-kit';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface Task {
  id: string;
  title: string;
  dueDate: string;
  priority: 'high' | 'medium' | 'low';
  category: 'work' | 'personal' | 'study';
  completed: boolean;
  createdAt: string;
  notificationId?: string;
}

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function TaskMasterApp() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    dueDate: '',
    priority: 'medium' as Task['priority'],
    category: 'work' as Task['category'],
  });
  const [filter, setFilter] = useState<'all' | 'work' | 'personal' | 'study'>('all');
  const [sortBy, setSortBy] = useState<'dueDate' | 'priority' | 'created'>('dueDate');
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'analytics'>('list');
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('month');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [productivityData, setProductivityData] = useState<any>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Request notification permissions
      await requestNotificationPermissions();
      
      // Load tasks from local storage
      await loadTasks();
      
      // Sync with backend
      await syncTasks();
      
      // Load analytics data
      await fetchAnalytics();
      
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to initialize app:', error);
      setIsLoading(false);
    }
  };

  const requestNotificationPermissions = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Notifications Disabled',
          'Please enable notifications in settings to receive task reminders.'
        );
      }
    } catch (error) {
      console.error('Failed to request notification permissions:', error);
    }
  };

  const loadTasks = async () => {
    try {
      const storedTasks = await AsyncStorage.getItem('tasks');
      if (storedTasks) {
        setTasks(JSON.parse(storedTasks));
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  };

  const saveTasks = async (tasksToSave: Task[]) => {
    try {
      await AsyncStorage.setItem('tasks', JSON.stringify(tasksToSave));
    } catch (error) {
      console.error('Failed to save tasks:', error);
    }
  };

  const syncTasks = async () => {
    try {
      console.log('Syncing tasks with backend...');
      // Fetch tasks from backend
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/tasks`);
      if (response.ok) {
        const backendTasks = await response.json();
        
        // Convert backend tasks to local format
        const convertedTasks = backendTasks.map((task: any) => ({
          id: task.id || task._id || task.createdAt,
          title: task.title,
          dueDate: task.dueDate,
          priority: task.priority,
          category: task.category,
          completed: task.completed,
          createdAt: task.createdAt,
          notificationId: task.notificationId,
        }));
        
        console.log('Synced tasks from backend:', convertedTasks.length);
        setTasks(convertedTasks);
        await saveTasks(convertedTasks);
      }
    } catch (error) {
      console.error('Failed to sync tasks:', error);
      console.log('Using local tasks only');
    }
  };

  const fetchAnalytics = async () => {
    try {
      console.log('Fetching analytics...');
      const [analyticsResponse, productivityResponse] = await Promise.all([
        fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/stats`),
        fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/analytics/productivity`)
      ]);
      
      if (analyticsResponse.ok && productivityResponse.ok) {
        const analytics = await analyticsResponse.json();
        const productivity = await productivityResponse.json();
        
        setAnalyticsData(analytics);
        setProductivityData(productivity);
        console.log('Analytics data loaded successfully');
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    }
  };

  const scheduleNotification = async (task: Task) => {
    try {
      const dueDate = new Date(task.dueDate);
      const now = new Date();
      
      if (dueDate > now) {
        // Schedule notification 1 hour before due date
        const notificationTime = new Date(dueDate.getTime() - 60 * 60 * 1000);
        
        if (notificationTime > now) {
          const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
              title: `Task Due Soon: ${task.title}`,
              body: `Your ${task.category} task is due in 1 hour`,
              data: { taskId: task.id },
            },
            trigger: { date: notificationTime },
          });
          
          return notificationId;
        }
      }
    } catch (error) {
      console.error('Failed to schedule notification:', error);
    }
    return null;
  };

  const cancelNotification = async (notificationId: string) => {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.error('Failed to cancel notification:', error);
    }
  };

  const addTask = async () => {
    if (!newTask.title.trim()) {
      Alert.alert('Error', 'Please enter a task title');
      return;
    }

    if (!newTask.dueDate) {
      Alert.alert('Error', 'Please select a due date');
      return;
    }

    const task: Task = {
      id: Date.now().toString(),
      title: newTask.title.trim(),
      dueDate: newTask.dueDate,
      priority: newTask.priority,
      category: newTask.category,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    // Schedule notification
    const notificationId = await scheduleNotification(task);
    if (notificationId) {
      task.notificationId = notificationId;
    }

    const updatedTasks = [...tasks, task];
    setTasks(updatedTasks);
    await saveTasks(updatedTasks);

    // Save to backend
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: task.title,
          dueDate: task.dueDate,
          priority: task.priority,
          category: task.category,
          notificationId: task.notificationId,
        }),
      });
      
      if (response.ok) {
        console.log('Task saved to backend successfully');
      }
    } catch (error) {
      console.error('Failed to save task to backend:', error);
    }

    // Reset form and close modal
    setNewTask({
      title: '',
      dueDate: '',
      priority: 'medium',
      category: 'work',
    });
    setShowAddModal(false);

    // Sync with backend
    await syncTasks();
  };

  const toggleTask = async (taskId: string) => {
    const updatedTasks = tasks.map(task => {
      if (task.id === taskId) {
        const updated = { ...task, completed: !task.completed };
        
        // Cancel notification if task is completed
        if (updated.completed && task.notificationId) {
          cancelNotification(task.notificationId);
        }
        
        return updated;
      }
      return task;
    });
    
    setTasks(updatedTasks);
    await saveTasks(updatedTasks);
    
    // Update on backend
    try {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/tasks/${task.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            completed: !task.completed,
          }),
        });
        
        if (response.ok) {
          console.log('Task completion status updated on backend');
        }
      }
    } catch (error) {
      console.error('Failed to update task on backend:', error);
    }
    
    await syncTasks();
  };

  const deleteTask = async (taskId: string) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (task?.notificationId) {
        await cancelNotification(task.notificationId);
      }
      
      // Delete from backend first
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/tasks/${taskId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        console.log('Task deleted from backend successfully');
      }
      
      // Update local state
      const updatedTasks = tasks.filter(t => t.id !== taskId);
      setTasks(updatedTasks);
      await saveTasks(updatedTasks);
      
      // Refresh analytics
      await fetchAnalytics();
      
      console.log(`Task ${taskId} deleted successfully`);
    } catch (error) {
      console.error('Failed to delete task:', error);
      // Still remove from local state even if backend fails
      const updatedTasks = tasks.filter(t => t.id !== taskId);
      setTasks(updatedTasks);
      await saveTasks(updatedTasks);
    }
  };

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getCategoryIcon = (category: Task['category']) => {
    switch (category) {
      case 'work': return 'briefcase';
      case 'personal': return 'person';
      case 'study': return 'school';
      default: return 'list';
    }
  };

  const getFilteredAndSortedTasks = () => {
    let filtered = tasks;
    
    // Filter out completed tasks unless showCompleted is true
    if (!showCompleted) {
      filtered = filtered.filter(task => !task.completed);
    }
    
    // Filter by category
    if (filter !== 'all') {
      filtered = filtered.filter(task => task.category === filter);
    }
    
    // Sort tasks
    filtered.sort((a, b) => {
      // Prioritize urgent tasks (due today or overdue)
      const aUrgent = isPast(new Date(a.dueDate)) || isToday(new Date(a.dueDate));
      const bUrgent = isPast(new Date(b.dueDate)) || isToday(new Date(b.dueDate));
      
      if (aUrgent && !bUrgent) return -1;
      if (!aUrgent && bUrgent) return 1;
      
      // Then sort by selected criteria
      switch (sortBy) {
        case 'dueDate':
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        case 'priority':
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        default:
          return 0;
      }
    });
    
    return filtered;
  };

  const getTaskDateText = (dueDate: string) => {
    const date = new Date(dueDate);
    if (isPast(date) && !isToday(date)) return 'Overdue';
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM dd, yyyy');
  };

  const getUrgentTasksCount = () => {
    return tasks.filter(task => 
      !task.completed && 
      (isPast(new Date(task.dueDate)) || isToday(new Date(task.dueDate)))
    ).length;
  };

  // Calendar helper functions
  const getTasksForDate = (date: string) => {
    return tasks.filter(task => {
      try {
        const taskDate = format(parseISO(task.dueDate), 'yyyy-MM-dd');
        return taskDate === date;
      } catch {
        return false;
      }
    });
  };

  const getMarkedDates = () => {
    const marked: any = {};
    
    // Mark dates with tasks
    tasks.forEach(task => {
      try {
        const dateKey = format(parseISO(task.dueDate), 'yyyy-MM-dd');
        if (!marked[dateKey]) {
          marked[dateKey] = { dots: [], selected: false };
        }
        
        const priorityColor = getPriorityColor(task.priority);
        const exists = marked[dateKey].dots.find((dot: any) => dot.color === priorityColor);
        
        if (!exists) {
          marked[dateKey].dots.push({
            color: priorityColor,
            selectedDotColor: priorityColor,
          });
        }
      } catch (error) {
        // Skip invalid dates
      }
    });

    // Mark selected date
    if (selectedDate && marked[selectedDate]) {
      marked[selectedDate].selected = true;
      marked[selectedDate].selectedColor = '#2563eb';
    } else if (selectedDate) {
      marked[selectedDate] = {
        selected: true,
        selectedColor: '#2563eb',
        dots: [],
      };
    }

    return marked;
  };

  const getWeekDays = () => {
    const start = startOfWeek(currentWeek);
    const end = endOfWeek(currentWeek);
    return eachDayOfInterval({ start, end });
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      setCurrentWeek(subWeeks(currentWeek, 1));
    } else {
      setCurrentWeek(addWeeks(currentWeek, 1));
    }
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      setCurrentMonth(subMonths(currentMonth, 1));
    } else {
      setCurrentMonth(addMonths(currentMonth, 1));
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.logo}>TM</Text>
          <Text style={styles.loadingText}>TaskMaster</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.logo}>TM</Text>
          <View>
            <Text style={styles.appName}>TaskMaster</Text>
            <Text style={styles.taskCount}>
              {tasks.filter(t => !t.completed).length} active tasks
            </Text>
          </View>
        </View>
        
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.viewToggle, viewMode === 'list' && styles.activeViewToggle]}
            onPress={() => setViewMode('list')}
          >
            <Ionicons 
              name="list" 
              size={18} 
              color={viewMode === 'list' ? '#ffffff' : '#64748b'} 
            />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.viewToggle, viewMode === 'calendar' && styles.activeViewToggle]}
            onPress={() => setViewMode('calendar')}
          >
            <Ionicons 
              name="calendar" 
              size={18} 
              color={viewMode === 'calendar' ? '#ffffff' : '#64748b'} 
            />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.viewToggle, viewMode === 'analytics' && styles.activeViewToggle]}
            onPress={() => {
              setViewMode('analytics');
              fetchAnalytics(); // Refresh analytics when switched
            }}
          >
            <Ionicons 
              name="analytics" 
              size={18} 
              color={viewMode === 'analytics' ? '#ffffff' : '#64748b'} 
            />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAddModal(true)}
          >
            <Ionicons name="add" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Urgent Tasks Banner */}
      {getUrgentTasksCount() > 0 && (
        <View style={styles.urgentBanner}>
          <Ionicons name="warning" size={20} color="#ef4444" />
          <Text style={styles.urgentText}>
            {getUrgentTasksCount()} urgent task(s) need attention
          </Text>
        </View>
      )}

      {/* Filters and Sort - only show in list view */}
      {viewMode === 'list' && (
        <View style={styles.filtersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {['all', 'work', 'personal', 'study'].map((filterOption) => (
              <TouchableOpacity
                key={filterOption}
                style={[
                  styles.filterButton,
                  filter === filterOption && styles.activeFilterButton
                ]}
                onPress={() => setFilter(filterOption as any)}
              >
                <Text style={[
                  styles.filterText,
                  filter === filterOption && styles.activeFilterText
                ]}>
                  {filterOption.charAt(0).toUpperCase() + filterOption.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => {
              const options = ['dueDate', 'priority', 'created'];
              const currentIndex = options.indexOf(sortBy);
              const nextIndex = (currentIndex + 1) % options.length;
              setSortBy(options[nextIndex] as any);
            }}
          >
            <Ionicons name="filter" size={20} color="#2563eb" />
          </TouchableOpacity>
        </View>
      )}

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <View style={styles.calendarContainer}>
          {/* Calendar View Toggle */}
          <View style={styles.calendarHeader}>
            <View style={styles.calendarNavigation}>
              <TouchableOpacity
                style={styles.navButton}
                onPress={() => calendarView === 'month' ? navigateMonth('prev') : navigateWeek('prev')}
              >
                <Ionicons name="chevron-back" size={24} color="#ffffff" />
              </TouchableOpacity>
              
              <Text style={styles.calendarTitle}>
                {calendarView === 'month' 
                  ? format(currentMonth, 'MMMM yyyy')
                  : `Week of ${format(startOfWeek(currentWeek), 'MMM dd')}`
                }
              </Text>
              
              <TouchableOpacity
                style={styles.navButton}
                onPress={() => calendarView === 'month' ? navigateMonth('next') : navigateWeek('next')}
              >
                <Ionicons name="chevron-forward" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.calendarViewToggle}>
              <TouchableOpacity
                style={[styles.calendarToggleButton, calendarView === 'month' && styles.activeCalendarToggle]}
                onPress={() => setCalendarView('month')}
              >
                <Text style={[
                  styles.calendarToggleText,
                  calendarView === 'month' && styles.activeCalendarToggleText
                ]}>
                  Month
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.calendarToggleButton, calendarView === 'week' && styles.activeCalendarToggle]}
                onPress={() => setCalendarView('week')}
              >
                <Text style={[
                  styles.calendarToggleText,
                  calendarView === 'week' && styles.activeCalendarToggleText
                ]}>
                  Week
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Calendar Component */}
          {calendarView === 'month' ? (
            <Calendar
              current={format(currentMonth, 'yyyy-MM-dd')}
              onDayPress={(day) => {
                setSelectedDate(day.dateString);
              }}
              markingType={'multi-dot'}
              markedDates={getMarkedDates()}
              theme={{
                backgroundColor: '#0f172a',
                calendarBackground: '#1e293b',
                textSectionTitleColor: '#64748b',
                selectedDayBackgroundColor: '#2563eb',
                selectedDayTextColor: '#ffffff',
                todayTextColor: '#2563eb',
                dayTextColor: '#ffffff',
                textDisabledColor: '#475569',
                dotColor: '#2563eb',
                selectedDotColor: '#ffffff',
                arrowColor: '#2563eb',
                disabledArrowColor: '#475569',
                monthTextColor: '#ffffff',
                indicatorColor: '#2563eb',
                textDayFontFamily: 'System',
                textMonthFontFamily: 'System',
                textDayHeaderFontFamily: 'System',
                textDayFontWeight: '400',
                textMonthFontWeight: 'bold',
                textDayHeaderFontWeight: '400',
                textDayFontSize: 16,
                textMonthFontSize: 18,
                textDayHeaderFontSize: 14
              }}
              style={styles.calendar}
            />
          ) : (
            <View style={styles.weekView}>
              {getWeekDays().map((day, index) => {
                const dateString = format(day, 'yyyy-MM-dd');
                const dayTasks = getTasksForDate(dateString);
                const isSelected = dateString === selectedDate;
                const isToday = isSameDay(day, new Date());
                
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.weekDay,
                      isSelected && styles.selectedWeekDay,
                      isToday && styles.todayWeekDay
                    ]}
                    onPress={() => setSelectedDate(dateString)}
                  >
                    <Text style={[
                      styles.weekDayName,
                      isSelected && styles.selectedWeekDayText
                    ]}>
                      {format(day, 'EEE')}
                    </Text>
                    <Text style={[
                      styles.weekDayNumber,
                      isSelected && styles.selectedWeekDayText,
                      isToday && styles.todayText
                    ]}>
                      {format(day, 'd')}
                    </Text>
                    
                    <View style={styles.weekDayTasks}>
                      {dayTasks.slice(0, 3).map((task, taskIndex) => (
                        <View
                          key={taskIndex}
                          style={[
                            styles.weekTaskDot,
                            { backgroundColor: getPriorityColor(task.priority) }
                          ]}
                        />
                      ))}
                      {dayTasks.length > 3 && (
                        <Text style={styles.moreTasks}>+{dayTasks.length - 3}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          
          {/* Selected Date Tasks */}
          <View style={styles.selectedDateTasks}>
            <Text style={styles.selectedDateTitle}>
              Tasks for {format(parseISO(selectedDate), 'MMMM dd, yyyy')}
            </Text>
            
            <ScrollView style={styles.dateTasksList}>
              {getTasksForDate(selectedDate).map((task) => (
                <View key={task.id} style={[
                  styles.dateTaskCard,
                  task.completed && styles.completedTaskCard
                ]}>
                  <View style={styles.dateTaskHeader}>
                    <TouchableOpacity
                      style={[
                        styles.checkbox,
                        task.completed && styles.completedCheckbox
                      ]}
                      onPress={() => toggleTask(task.id)}
                    >
                      {task.completed && (
                        <Ionicons name="checkmark" size={16} color="#ffffff" />
                      )}
                    </TouchableOpacity>
                    
                    <View style={styles.dateTaskInfo}>
                      <Text style={[
                        styles.dateTaskTitle,
                        task.completed && styles.completedTaskTitle
                      ]}>
                        {task.title}
                      </Text>
                      
                      <View style={styles.dateTaskMeta}>
                        <View style={styles.metaItem}>
                          <Ionicons 
                            name={getCategoryIcon(task.category)} 
                            size={12} 
                            color="#64748b" 
                          />
                          <Text style={styles.metaText}>{task.category}</Text>
                        </View>
                        
                        <View style={styles.metaItem}>
                          <View style={[
                            styles.priorityDot,
                            { backgroundColor: getPriorityColor(task.priority) }
                          ]} />
                          <Text style={styles.metaText}>{task.priority}</Text>
                        </View>
                      </View>
                    </View>
                    
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deleteTask(task.id)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              
              {getTasksForDate(selectedDate).length === 0 && (
                <View style={styles.noTasksForDate}>
                  <Ionicons name="calendar-outline" size={48} color="#64748b" />
                  <Text style={styles.noTasksText}>No tasks for this date</Text>
                  <TouchableOpacity
                    style={styles.addTaskButton}
                    onPress={() => {
                      setNewTask({
                        ...newTask,
                        dueDate: format(parseISO(selectedDate), "yyyy-MM-dd'T'HH:mm")
                      });
                      setShowAddModal(true);
                    }}
                  >
                    <Text style={styles.addTaskButtonText}>Add Task for This Date</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Tasks List - only show in list view */}
      {viewMode === 'list' && (
        <ScrollView style={styles.tasksContainer}>
          {getFilteredAndSortedTasks().map((task) => (
            <View key={task.id} style={[
              styles.taskCard,
              task.completed && styles.completedTaskCard
            ]}>
              <View style={styles.taskHeader}>
                <TouchableOpacity
                  style={[
                    styles.checkbox,
                    task.completed && styles.completedCheckbox
                  ]}
                  onPress={() => toggleTask(task.id)}
                >
                  {task.completed && (
                    <Ionicons name="checkmark" size={16} color="#ffffff" />
                  )}
                </TouchableOpacity>
                
                <View style={styles.taskInfo}>
                  <Text style={[
                    styles.taskTitle,
                    task.completed && styles.completedTaskTitle
                  ]}>
                    {task.title}
                  </Text>
                  
                  <View style={styles.taskMeta}>
                    <View style={styles.metaItem}>
                      <Ionicons 
                        name={getCategoryIcon(task.category)} 
                        size={12} 
                        color="#6b7280" 
                      />
                      <Text style={styles.metaText}>{task.category}</Text>
                    </View>
                    
                    <View style={styles.metaItem}>
                      <View style={[
                        styles.priorityDot,
                        { backgroundColor: getPriorityColor(task.priority) }
                      ]} />
                      <Text style={styles.metaText}>{task.priority}</Text>
                    </View>
                    
                    <View style={styles.metaItem}>
                      <Ionicons name="calendar" size={12} color="#6b7280" />
                      <Text style={[
                        styles.metaText,
                        (isPast(new Date(task.dueDate)) && !task.completed) && styles.overdueText
                      ]}>
                        {getTaskDateText(task.dueDate)}
                      </Text>
                    </View>
                  </View>
                </View>
                
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => deleteTask(task.id)}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          
          {getFilteredAndSortedTasks().length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={64} color="#6b7280" />
              <Text style={styles.emptyStateText}>
                {filter === 'all' ? 'No tasks yet' : `No ${filter} tasks`}
              </Text>
              <Text style={styles.emptyStateSubtext}>
                Tap the + button to add your first task
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Analytics Dashboard */}
      {viewMode === 'analytics' && (
        <ScrollView style={styles.analyticsContainer}>
          {analyticsData ? (
            <>
              {/* Overview Cards */}
              <View style={styles.overviewSection}>
                <Text style={styles.sectionTitle}>Overview</Text>
                
                <View style={styles.statsGrid}>
                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>{analyticsData.overview.totalTasks}</Text>
                    <Text style={styles.statLabel}>Total Tasks</Text>
                  </View>
                  
                  <View style={styles.statCard}>
                    <Text style={[styles.statNumber, {color: '#10b981'}]}>{analyticsData.overview.completedTasks}</Text>
                    <Text style={styles.statLabel}>Completed</Text>
                  </View>
                  
                  <View style={styles.statCard}>
                    <Text style={[styles.statNumber, {color: '#f59e0b'}]}>{analyticsData.overview.pendingTasks}</Text>
                    <Text style={styles.statLabel}>Pending</Text>
                  </View>
                  
                  <View style={styles.statCard}>
                    <Text style={[styles.statNumber, {color: '#ef4444'}]}>{analyticsData.overview.overdueTask}</Text>
                    <Text style={styles.statLabel}>Overdue</Text>
                  </View>
                </View>
                
                {/* Completion Rate Circle */}
                <View style={styles.completionRateCard}>
                  <View style={styles.completionRateCircle}>
                    <Text style={styles.completionRateNumber}>
                      {analyticsData.overview.completionRate}%
                    </Text>
                    <Text style={styles.completionRateLabel}>Completion Rate</Text>
                  </View>
                  
                  <View style={styles.todayWeekStats}>
                    <View style={styles.quickStat}>
                      <Text style={styles.quickStatNumber}>{analyticsData.overview.todayTasks}</Text>
                      <Text style={styles.quickStatLabel}>Today</Text>
                    </View>
                    <View style={styles.quickStat}>
                      <Text style={styles.quickStatNumber}>{analyticsData.overview.weekTasks}</Text>
                      <Text style={styles.quickStatLabel}>This Week</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Category Analysis */}
              <View style={styles.categorySection}>
                <Text style={styles.sectionTitle}>Category Breakdown</Text>
                
                <View style={styles.categoryGrid}>
                  {Object.entries(analyticsData.categoryStats).map(([category, stats]: [string, any]) => (
                    <View key={category} style={styles.categoryCard}>
                      <View style={styles.categoryHeader}>
                        <Ionicons 
                          name={getCategoryIcon(category as any)} 
                          size={24} 
                          color="#2563eb" 
                        />
                        <Text style={styles.categoryName}>{category}</Text>
                      </View>
                      
                      <View style={styles.categoryStats}>
                        <Text style={styles.categoryTotal}>{stats.total} tasks</Text>
                        <Text style={styles.categoryCompleted}>{stats.completed} completed</Text>
                        <Text style={[styles.categoryRate, {color: stats.completionRate > 70 ? '#10b981' : stats.completionRate > 40 ? '#f59e0b' : '#ef4444'}]}>
                          {stats.completionRate}% done
                        </Text>
                      </View>
                      
                      {/* Progress bar */}
                      <View style={styles.progressBar}>
                        <View 
                          style={[
                            styles.progressFill, 
                            { 
                              width: `${stats.completionRate}%`,
                              backgroundColor: stats.completionRate > 70 ? '#10b981' : stats.completionRate > 40 ? '#f59e0b' : '#ef4444'
                            }
                          ]} 
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {/* Priority Analysis */}
              <View style={styles.prioritySection}>
                <Text style={styles.sectionTitle}>Priority Distribution</Text>
                
                <View style={styles.priorityGrid}>
                  {Object.entries(analyticsData.priorityStats).map(([priority, stats]: [string, any]) => (
                    <View key={priority} style={styles.priorityCard}>
                      <View style={styles.priorityHeader}>
                        <View style={[
                          styles.priorityDot,
                          { backgroundColor: getPriorityColor(priority as any) }
                        ]} />
                        <Text style={styles.priorityName}>{priority}</Text>
                      </View>
                      
                      <Text style={styles.priorityTotal}>{stats.total}</Text>
                      <Text style={styles.prioritySubtext}>
                        {stats.completed} / {stats.total} done
                      </Text>
                      
                      <View style={styles.priorityProgressBar}>
                        <View 
                          style={[
                            styles.priorityProgressFill, 
                            { 
                              width: `${stats.completionRate}%`,
                              backgroundColor: getPriorityColor(priority as any)
                            }
                          ]} 
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {/* Daily Trends Chart */}
              {analyticsData.dailyTrends && analyticsData.dailyTrends.length > 0 && (
                <View style={styles.trendsSection}>
                  <Text style={styles.sectionTitle}>7-Day Completion Trend</Text>
                  
                  <View style={styles.chartContainer}>
                    <LineChart
                      data={{
                        labels: analyticsData.dailyTrends.map((day: any) => day.day),
                        datasets: [{
                          data: analyticsData.dailyTrends.map((day: any) => day.completionRate),
                          color: () => '#2563eb',
                          strokeWidth: 3
                        }]
                      }}
                      width={Dimensions.get('window').width - 40}
                      height={200}
                      chartConfig={{
                        backgroundColor: '#1e293b',
                        backgroundGradientFrom: '#1e293b',
                        backgroundGradientTo: '#1e293b',
                        color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                        labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
                        style: {
                          borderRadius: 12
                        },
                        propsForDots: {
                          r: '4',
                          strokeWidth: '2',
                          stroke: '#2563eb'
                        }
                      }}
                      style={styles.chart}
                      bezier
                    />
                  </View>
                </View>
              )}

              {/* Productivity Insights */}
              {analyticsData.insights && (
                <View style={styles.insightsSection}>
                  <Text style={styles.sectionTitle}>Productivity Insights</Text>
                  
                  <View style={styles.insightCard}>
                    <Ionicons name="trophy" size={24} color="#f59e0b" />
                    <View style={styles.insightContent}>
                      <Text style={styles.insightTitle}>Most Productive Category</Text>
                      <Text style={styles.insightText}>
                        {analyticsData.insights.mostProductiveCategory || 'No data yet'}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.insightCard}>
                    <Ionicons name="trending-up" size={24} color="#10b981" />
                    <View style={styles.insightContent}>
                      <Text style={styles.insightTitle}>Daily Average</Text>
                      <Text style={styles.insightText}>
                        {analyticsData.insights.averageTasksPerDay} tasks per day
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.insightCard}>
                    <Ionicons name="speedometer" size={24} color="#2563eb" />
                    <View style={styles.insightContent}>
                      <Text style={styles.insightTitle}>Productivity Score</Text>
                      <Text style={styles.insightText}>
                        {analyticsData.insights.productivityScore}/100
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Weekly Trends */}
              {productivityData?.weeklyTrends && (
                <View style={styles.weeklySection}>
                  <Text style={styles.sectionTitle}>Weekly Progress</Text>
                  
                  <View style={styles.chartContainer}>
                    <BarChart
                      data={{
                        labels: productivityData.weeklyTrends.map((week: any) => week.week.replace('Week ', 'W')),
                        datasets: [{
                          data: productivityData.weeklyTrends.map((week: any) => week.completed),
                        }]
                      }}
                      width={Dimensions.get('window').width - 40}
                      height={200}
                      chartConfig={{
                        backgroundColor: '#1e293b',
                        backgroundGradientFrom: '#1e293b',
                        backgroundGradientTo: '#1e293b',
                        color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
                        labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
                        style: {
                          borderRadius: 12
                        }
                      }}
                      style={styles.chart}
                    />
                  </View>
                </View>
              )}
              
              {/* Refresh Button */}
              <TouchableOpacity 
                style={styles.refreshButton}
                onPress={fetchAnalytics}
              >
                <Ionicons name="refresh" size={20} color="#ffffff" />
                <Text style={styles.refreshText}>Refresh Analytics</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.analyticsLoading}>
              <Ionicons name="analytics" size={64} color="#64748b" />
              <Text style={styles.analyticsLoadingText}>Loading Analytics...</Text>
              <Text style={styles.analyticsLoadingSubtext}>
                Analyzing your productivity data
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Add Task Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowAddModal(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            
            <Text style={styles.modalTitle}>New Task</Text>
            
            <TouchableOpacity
              style={styles.saveButton}
              onPress={addTask}
            >
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter task title"
                value={newTask.title}
                onChangeText={(text) => setNewTask({ ...newTask, title: text })}
                autoFocus
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Due Date</Text>
              <TextInput
                style={styles.textInput}
                placeholder="YYYY-MM-DD HH:MM"
                value={newTask.dueDate}
                onChangeText={(text) => setNewTask({ ...newTask, dueDate: text })}
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Priority</Text>
              <View style={styles.optionRow}>
                {['high', 'medium', 'low'].map((priority) => (
                  <TouchableOpacity
                    key={priority}
                    style={[
                      styles.optionButton,
                      newTask.priority === priority && styles.activeOption
                    ]}
                    onPress={() => setNewTask({ ...newTask, priority: priority as any })}
                  >
                    <Text style={[
                      styles.optionText,
                      newTask.priority === priority && styles.activeOptionText
                    ]}>
                      {priority}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.optionRow}>
                {['work', 'personal', 'study'].map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[
                      styles.optionButton,
                      newTask.category === category && styles.activeOption
                    ]}
                    onPress={() => setNewTask({ ...newTask, category: category as any })}
                  >
                    <Text style={[
                      styles.optionText,
                      newTask.category === category && styles.activeOptionText
                    ]}>
                      {category}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2563eb',
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 24,
    color: '#ffffff',
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e293b',
  },
  activeViewToggle: {
    backgroundColor: '#2563eb',
  },
  appName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginLeft: 12,
  },
  taskCount: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 12,
  },
  addButton: {
    backgroundColor: '#2563eb',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  urgentBanner: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    marginHorizontal: 20,
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  urgentText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  filtersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#1e293b',
  },
  activeFilterButton: {
    backgroundColor: '#2563eb',
  },
  filterText: {
    color: '#64748b',
    fontSize: 14,
  },
  activeFilterText: {
    color: '#ffffff',
  },
  sortButton: {
    marginLeft: 'auto',
    padding: 8,
  },
  tasksContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  taskCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
  },
  completedTaskCard: {
    opacity: 0.6,
    borderLeftColor: '#10b981',
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#64748b',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  completedCheckbox: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  completedTaskTitle: {
    textDecorationLine: 'line-through',
    color: '#64748b',
  },
  taskMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 4,
  },
  overdueText: {
    color: '#ef4444',
    fontWeight: '600',
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  deleteButton: {
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyStateText: {
    fontSize: 18,
    color: '#64748b',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  cancelButton: {
    padding: 8,
  },
  cancelText: {
    color: '#64748b',
    fontSize: 16,
  },
  saveButton: {
    padding: 8,
  },
  saveText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#334155',
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  activeOption: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  optionText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  activeOptionText: {
    color: '#ffffff',
  },
  // Calendar Styles
  calendarContainer: {
    flex: 1,
  },
  calendarHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  calendarNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  calendarViewToggle: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 4,
  },
  calendarToggleButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  activeCalendarToggle: {
    backgroundColor: '#2563eb',
  },
  calendarToggleText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  activeCalendarToggleText: {
    color: '#ffffff',
  },
  calendar: {
    marginHorizontal: 20,
    borderRadius: 12,
    marginVertical: 8,
  },
  weekView: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  weekDay: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    marginHorizontal: 2,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  selectedWeekDay: {
    backgroundColor: '#2563eb',
  },
  todayWeekDay: {
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  weekDayName: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  weekDayNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  selectedWeekDayText: {
    color: '#ffffff',
  },
  todayText: {
    color: '#2563eb',
  },
  weekDayTasks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  weekTaskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  moreTasks: {
    fontSize: 10,
    color: '#64748b',
    marginLeft: 2,
  },
  selectedDateTasks: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  selectedDateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
  },
  dateTasksList: {
    flex: 1,
  },
  dateTaskCard: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#2563eb',
  },
  dateTaskHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  dateTaskInfo: {
    flex: 1,
    marginLeft: 12,
  },
  dateTaskTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  dateTaskMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  noTasksForDate: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noTasksText: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 12,
    marginBottom: 16,
  },
  addTaskButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addTaskButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Analytics Styles
  analyticsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  overviewSection: {
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  completionRateCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  completionRateCircle: {
    alignItems: 'center',
  },
  completionRateNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  completionRateLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  todayWeekStats: {
    gap: 16,
  },
  quickStat: {
    alignItems: 'center',
  },
  quickStatNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  quickStatLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  categorySection: {
    marginVertical: 16,
  },
  categoryGrid: {
    gap: 12,
  },
  categoryCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 8,
    textTransform: 'capitalize',
  },
  categoryStats: {
    marginBottom: 8,
  },
  categoryTotal: {
    fontSize: 14,
    color: '#ffffff',
    marginBottom: 2,
  },
  categoryCompleted: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 2,
  },
  categoryRate: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  prioritySection: {
    marginVertical: 16,
  },
  priorityGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  priorityCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  priorityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  priorityName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 6,
    textTransform: 'capitalize',
  },
  priorityTotal: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  prioritySubtext: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  priorityProgressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    overflow: 'hidden',
  },
  priorityProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  trendsSection: {
    marginVertical: 16,
  },
  chartContainer: {
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
  },
  chart: {
    borderRadius: 12,
  },
  insightsSection: {
    marginVertical: 16,
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  insightContent: {
    marginLeft: 12,
    flex: 1,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  insightText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  weeklySection: {
    marginVertical: 16,
  },
  refreshButton: {
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginVertical: 20,
  },
  refreshText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  analyticsLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  analyticsLoadingText: {
    fontSize: 18,
    color: '#64748b',
    marginTop: 16,
  },
  analyticsLoadingSubtext: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
  },
  // Analytics Styles
  analyticsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  overviewSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  completionRateCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  completionRateCircle: {
    alignItems: 'center',
  },
  completionRateNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  completionRateLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  todayWeekStats: {
    gap: 16,
  },
  quickStat: {
    alignItems: 'center',
  },
  quickStatNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  quickStatLabel: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryGrid: {
    gap: 12,
  },
  categoryCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 8,
    textTransform: 'capitalize',
  },
  categoryStats: {
    marginBottom: 12,
  },
  categoryTotal: {
    fontSize: 14,
    color: '#ffffff',
    marginBottom: 2,
  },
  categoryCompleted: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 2,
  },
  categoryRate: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  prioritySection: {
    marginBottom: 24,
  },
  priorityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  priorityCard: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  priorityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  priorityName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 6,
    textTransform: 'capitalize',
  },
  priorityTotal: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  prioritySubtext: {
    fontSize: 10,
    color: '#64748b',
    marginBottom: 8,
  },
  priorityProgressBar: {
    width: '100%',
    height: 3,
    backgroundColor: '#334155',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  priorityProgressFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  trendsSection: {
    marginBottom: 24,
  },
  chartContainer: {
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
  },
  chart: {
    borderRadius: 12,
  },
  insightsSection: {
    marginBottom: 24,
  },
  insightCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  insightContent: {
    marginLeft: 12,
    flex: 1,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  insightText: {
    fontSize: 12,
    color: '#64748b',
  },
  weeklySection: {
    marginBottom: 24,
  },
  refreshButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  refreshText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  analyticsLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  analyticsLoadingText: {
    fontSize: 18,
    color: '#64748b',
    marginTop: 16,
    fontWeight: '600',
  },
  analyticsLoadingSubtext: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
    textAlign: 'center',
  },
});