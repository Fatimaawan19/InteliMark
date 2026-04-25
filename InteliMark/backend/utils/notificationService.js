const { admin, firestore } = require("../config/firebase");

/**
 * ============================================================
 * NOTIFICATION SERVICE - Firebase Firestore First
 * ============================================================
 * 
 * All notifications are stored in Firebase Firestore collection:
 * firestore -> notifications -> [all notification docs]
 * 
 * Notification Types:
 * - 'assessment-created': When a new quiz/assignment is created
 * - 'assessment-updated': When an assessment is modified
 * - 'assessment-deleted': When an assessment is removed
 * - 'assessment-published': When a draft assessment goes live
 * - 'submission-created': When a student submits work
 * - 'submission-graded': When teacher grades a submission
 * - 'student-registered': When a student registers for a course
 * - 'announcement-created': When teacher posts an announcement
 * - 'course-updated': When teacher updates course description
 * 
 * Recipients:
 * - Teachers (creator of assessment)
 * - Students (registered in the course)
 * - Admins (all system admins)
 * 
 * Each notification includes:
 * {
 *   type: string (notification type)
 *   recipientId: string (Firebase user ID)
 *   recipientRole: string ('teacher', 'student', 'admin')
 *   title: string (short title)
 *   message: string (detailed message)
 *   assessmentId: string (MongoDB assessment ID)
 *   assessmentTitle: string
 *   courseId: string (MongoDB course ID)
 *   courseCode: string
 *   courseName: string
 *   createdById: string (creator's Firebase ID)
 *   createdByName: string (creator's name)
 *   read: boolean (default: false)
 *   createdAt: timestamp (Firestore server timestamp)
 * }
 * ============================================================
 */

/**
 * Create a reusable function to add notifications to Firebase
 */
async function addFirebaseNotification(recipientId, data) {
  try {
    const docRef = await firestore.collection('notifications').add({
      ...data,
      recipientId: recipientId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`   ✅ Firebase notification created: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error(`   ❌ Firebase notification failed for ${recipientId}:`, error.message);
    throw error;
  }
}

/**
 * Create a Firebase notification at a deterministic doc id.
 * If it already exists, it will NOT create a duplicate.
 */
async function addFirebaseNotificationOnce(recipientId, deterministicId, data) {
  if (!deterministicId) {
    return addFirebaseNotification(recipientId, data);
  }

  const safeId = String(deterministicId).replace(/[^\w\-]/g, "_").slice(0, 250);
  const docRef = firestore.collection("notifications").doc(safeId);
  const existing = await docRef.get();
  if (existing.exists) {
    return existing.id;
  }

  await docRef.set({
    ...data,
    recipientId: recipientId,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`   ✅ Firebase notification created (deduped): ${docRef.id}`);
  return docRef.id;
}

/**
 * Create notifications for assessment creation
 * PRIMARY: Firebase Firestore
 * BACKUP: MongoDB (optional)
 */
async function notifyAssessmentCreated(assessment, course, teacherId, teacherFname, studentIds = []) {
  try {
    const typeLabel = assessment.type === 'quiz' ? '📝 QUIZ' : '📋 ASSIGNMENT';
    console.log(`\n🔔 [${typeLabel}] Starting notification creation in Firebase...`);
    console.log(`   Assessment: ${assessment.title} (${assessment._id})`);
    console.log(`   Type: ${assessment.type}`);
    console.log(`   Teacher: ${teacherId} (${teacherFname})`);
    console.log(`   Students to notify: ${studentIds?.length || 0}`);
    
    const assessmentType = assessment.type === 'quiz' ? 'Quiz' : 'Assignment';
    const firebaseNotificationIds = [];

    // 1. ✅ Notify the teacher (creator)
    const teacherTitle = `${assessmentType} Created`;
    const teacherMessage = `You created ${assessmentType.toLowerCase()} for ${course.courseTitle}`;
    
    console.log(`   📝 Creating teacher notification...`);
    try {
      const teacherNotifId = await addFirebaseNotification(teacherId, {
        type: 'assessment-created',
        recipientRole: 'teacher',
        title: teacherTitle,
        message: teacherMessage,
        assessmentId: assessment._id.toString(),
        assessmentTitle: assessment.title,
        courseId: course._id.toString(),
        courseCode: course.courseCode,
        courseName: course.courseTitle,
        createdById: teacherId,
        createdByName: teacherFname,
        submissionDeadline: assessment.submissionDeadline,
        scheduledTime: assessment.scheduledTime
      });
      firebaseNotificationIds.push(teacherNotifId);
    } catch (error) {
      console.error(`   ❌ Failed to create teacher notification:`, error.message);
    }
    console.log(`✅ Teacher notification created`);

    // 2. ✅ Notify registered students
    if (studentIds && studentIds.length > 0) {
      console.log(`   📝 Creating ${studentIds.length} student notifications...`);
      
      for (const studentId of studentIds) {
        const studentTitle = `New ${assessmentType} Available`;
        const studentMessage = `${teacherFname} created ${assessmentType.toLowerCase()} for ${course.courseTitle}`;
        
        try {
          const studentNotifId = await addFirebaseNotification(studentId, {
            type: 'assessment-created',
            recipientRole: 'student',
            title: studentTitle,
            message: studentMessage,
            assessmentId: assessment._id.toString(),
            assessmentTitle: assessment.title,
            assessmentType: assessmentType,
            courseId: course._id.toString(),
            courseCode: course.courseCode,
            courseName: course.courseTitle,
            createdById: teacherId,
            createdByName: teacherFname,
            scheduledTime: assessment.scheduledTime,
            submissionDeadline: assessment.submissionDeadline,
            duration: assessment.type === 'quiz' ? assessment.duration : undefined
          });
          firebaseNotificationIds.push(studentNotifId);
        } catch (error) {
          console.error(`   ⚠️ Failed to create student notification for ${studentId}:`, error.message);
        }
      }
      console.log(`✅ All student notifications created (${studentIds.length} students)`);
    } else {
      console.log(`ℹ️ No students to notify`);
    }

    // 3. ✅ Notify all admins
    let adminCount = 0;
    try {
      const adminsSnapshot = await firestore.collection('users').where('role', '==', 'admin').get();
      console.log(`   📊 Found ${adminsSnapshot.size} admins in Firebase`);
      adminCount = adminsSnapshot.size;
      
      if (adminsSnapshot.size > 0) {
        console.log(`   📝 Creating ${adminsSnapshot.size} admin notifications...`);
        
        for (const adminDoc of adminsSnapshot.docs) {
          const adminId = adminDoc.id;
          const adminTitle = `New ${assessmentType} Created`;
          const adminMessage = `${teacherFname} created ${assessmentType.toLowerCase()} for ${course.courseTitle}`;
          
          try {
            const adminNotifId = await addFirebaseNotification(adminId, {
              type: 'assessment-created',
              recipientRole: 'admin',
              title: adminTitle,
              message: adminMessage,
              assessmentId: assessment._id.toString(),
              assessmentTitle: assessment.title,
              assessmentType: assessmentType,
              courseId: course._id.toString(),
              courseCode: course.courseCode,
              courseName: course.courseTitle,
              createdById: teacherId,
              createdByName: teacherFname,
              scheduledTime: assessment.scheduledTime,
              submissionDeadline: assessment.submissionDeadline,
              duration: assessment.type === 'quiz' ? assessment.duration : undefined
            });
            firebaseNotificationIds.push(adminNotifId);
          } catch (error) {
            console.error(`   ⚠️ Failed to create admin notification for ${adminId}:`, error.message);
          }
        }
        console.log(`✅ All admin notifications created (${adminsSnapshot.size} admins)`);
      }
    } catch (adminError) {
      console.error('❌ Error fetching admins from Firebase:', adminError.message);
    }

    const totalNotifications = firebaseNotificationIds.length;
    console.log(`\n✅ [${typeLabel}] TOTAL FIREBASE NOTIFICATIONS CREATED: ${totalNotifications}`);
    console.log(`   - Teacher: 1`);
    console.log(`   - Students: ${studentIds?.length || 0}`);
    console.log(`   - Admins: ${adminCount}`);
    console.log(`\n🎉 [${typeLabel}] Notifications should now appear in:`);
    console.log(`   📬 Notification dropdown (bell icon)`);
    console.log(`   📋 Notifications page`);
    
    return { success: true, notificationIds: firebaseNotificationIds, total: totalNotifications };

  } catch (error) {
    console.error('❌ Error creating notifications:', error);
    console.error('   Stack:', error.stack);
    // Don't throw - notifications shouldn't block assessment creation
    return { success: false, error: error.message };
  }
}

/**
 * Mark notifications as read in Firebase
 */
async function markNotificationsAsRead(recipientId, notificationIds) {
  try {
    const batch = firestore.batch();
    
    if (notificationIds && notificationIds.length > 0) {
      // Mark specific notifications as read
      console.log(`📝 Marking ${notificationIds.length} notifications as read...`);
      
      for (const notifId of notificationIds) {
        const docRef = firestore.collection('notifications').doc(notifId);
        batch.update(docRef, { read: true });
      }
    } else {
      // Mark all unread notifications as read for this user
      console.log(`📝 Marking all notifications as read for user ${recipientId}...`);
      
      const snapshot = await firestore.collection('notifications')
        .where('recipientId', '==', recipientId)
        .where('read', '==', false)
        .get();
      
      snapshot.forEach(doc => {
        batch.update(doc.ref, { read: true });
      });
    }
    
    await batch.commit();
    console.log(`✅ Notifications marked as read in Firebase`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error marking notifications as read:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get unread notifications count for a user from Firebase
 */
async function getUnreadCount(recipientId) {
  try {
    const snapshot = await firestore.collection('notifications')
      .where('recipientId', '==', recipientId)
      .where('read', '==', false)
      .get();
    
    const count = snapshot.size;
    console.log(`📊 Unread count for ${recipientId}: ${count}`);
    return count;
  } catch (error) {
    console.error('❌ Error getting unread count:', error.message);
    return 0;
  }
}

/**
 * Create notification when student submits an assessment
 */
async function notifySubmissionCreated(submission, assessment, course, studentId) {
  try {
    console.log(`\n🔔 Creating submission notification...`);
    console.log(`   Submission: ${submission._id} for assessment: ${assessment.title}`);
    
    const assessmentType = assessment.type === 'quiz' ? 'Quiz' : 'Assignment';
    const teacherId = assessment.teacherId;

    // Get student name from Firebase
    let studentName = 'A student';
    try {
      const studentDoc = await firestore.collection('users').doc(studentId).get();
      if (studentDoc.exists) {
        const studentData = studentDoc.data();
        studentName = studentData.name || studentData.email || 'A student';
      }
    } catch (error) {
      console.warn('⚠️ Could not fetch student name');
    }

    // Notify teacher
    const teacherTitle = `New ${assessmentType} Submission`;
    const teacherMessage = `${studentName} submitted ${assessment.title} for ${course.courseTitle}${submission.isLate ? ' (Late)' : ''}`;
    
    await addFirebaseNotification(teacherId, {
      type: 'submission-created',
      recipientRole: 'teacher',
      title: teacherTitle,
      message: teacherMessage,
      assessmentId: assessment._id.toString(),
      assessmentTitle: assessment.title,
      submissionId: submission._id.toString(),
      courseId: course._id.toString(),
      courseCode: course.courseCode,
      courseName: course.courseTitle,
      studentId: studentId,
      isLate: submission.isLate,
      createdById: studentId,
      createdByName: studentName
    });

    console.log(`✅ Teacher notified of submission`);

    // Also notify admins
    const adminsSnapshot = await firestore.collection('users').where('role', '==', 'admin').get();
    for (const adminDoc of adminsSnapshot.docs) {
      await addFirebaseNotification(adminDoc.id, {
        type: 'submission-created',
        recipientRole: 'admin',
        title: teacherTitle,
        message: teacherMessage,
        assessmentId: assessment._id.toString(),
        assessmentTitle: assessment.title,
        submissionId: submission._id.toString(),
        courseId: course._id.toString(),
        courseCode: course.courseCode,
        courseName: course.courseTitle,
        studentId: studentId,
        isLate: submission.isLate,
        createdById: studentId,
        createdByName: studentName
      });
    }

    console.log(`✅ Submission notifications sent`);
  } catch (error) {
    console.error('❌ Error creating submission notification:', error.message);
    throw error;
  }
}

/**
 * Log submission activity for admin dashboard activity feed.
 */
async function logSubmissionActivity(submission, assessment, course, studentId) {
  try {
    let studentName = 'A student';
    try {
      const studentDoc = await firestore.collection('users').doc(studentId).get();
      if (studentDoc.exists) {
        const studentData = studentDoc.data();
        studentName = studentData.name || studentData.email || 'A student';
      }
    } catch (error) {
      console.warn('⚠️ Could not fetch student name for activity log');
    }

    const assessmentType = assessment.type === 'quiz' ? 'quiz' : 'assignment';
    const courseName = course.courseTitle || course.courseName || course.courseCode;
    const activityMessage = `${studentName} has submitted ${assessmentType} of ${courseName}`;

    await firestore.collection('activities').add({
      type: 'submission-created',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      studentId,
      studentName,
      assessmentId: assessment._id.toString(),
      assessmentTitle: assessment.title,
      assessmentType,
      courseId: course._id.toString(),
      courseCode: course.courseCode,
      courseName,
      submissionId: submission._id.toString(),
      message: activityMessage,
      isLate: !!submission.isLate
    });

    console.log('✅ Submission activity logged for admin dashboard');
  } catch (error) {
    console.error('❌ Error logging submission activity:', error.message);
    throw error;
  }
}

/**
 * Create notification when teacher grades a submission
 */
async function notifySubmissionGraded(submission, assessment, studentId) {
  try {
    console.log(`\n🔔 Creating grading notification...`);
    console.log(`   Submission: ${submission._id} graded: ${submission.grade}/${submission.maxGrade}`);
    
    const assessmentType = assessment.type === 'quiz' ? 'Quiz' : 'Assignment';
    const gradePercentage = ((submission.grade / submission.maxGrade) * 100).toFixed(1);

    // Get teacher name
    let teacherName = 'Your teacher';
    try {
      const teacherDoc = await firestore.collection('users').doc(submission.gradedBy).get();
      if (teacherDoc.exists) {
        const teacherData = teacherDoc.data();
        teacherName = teacherData.name || teacherData.email || 'Your teacher';
      }
    } catch (error) {
      console.warn('⚠️ Could not fetch teacher name');
    }

    // Notify student
    const studentTitle = `${assessmentType} Graded`;
    const studentMessage = `${teacherName} graded your ${assessment.title}: ${submission.grade}/${submission.maxGrade} (${gradePercentage}%)`;
    
    await addFirebaseNotification(studentId, {
      type: 'submission-graded',
      recipientRole: 'student',
      title: studentTitle,
      message: studentMessage,
      assessmentId: assessment._id.toString(),
      assessmentTitle: assessment.title,
      submissionId: submission._id.toString(),
      grade: submission.grade,
      maxGrade: submission.maxGrade,
      gradePercentage: gradePercentage,
      feedback: submission.feedback || '',
      createdById: submission.gradedBy,
      createdByName: teacherName
    });

    console.log(`✅ Student notified of grade`);
  } catch (error) {
    console.error('❌ Error creating grading notification:', error.message);
    throw error;
  }
}

/**
 * Create notification when student registers for a course
 */
async function notifyStudentRegistered(courseData, studentId, studentName) {
  try {
    console.log(`\n🔔 Creating student registration notification...`);
    console.log(`   Student: ${studentName} (${studentId})`);
    console.log(`   Course: ${courseData.courseName || courseData.courseTitle}`);
    
    const teacherId = courseData.assignedTeacher;
    if (!teacherId) {
      console.warn('⚠️ No teacher assigned to course');
      return;
    }

    // Notify teacher
    const teacherTitle = `New Student Registered`;
    const teacherMessage = `${studentName} registered for ${courseData.courseName || courseData.courseTitle}`;
    
    await addFirebaseNotification(teacherId, {
      type: 'student-registered',
      recipientRole: 'teacher',
      title: teacherTitle,
      message: teacherMessage,
      courseId: courseData.id || courseData._id,
      courseName: courseData.courseName || courseData.courseTitle,
      courseCode: courseData.courseCode,
      studentId: studentId,
      studentName: studentName,
      createdById: studentId,
      createdByName: studentName
    });

    console.log(`✅ Teacher notified of student registration`);
  } catch (error) {
    console.error('❌ Error creating student registration notification:', error.message);
  }
}

/**
 * Create notification when teacher posts an announcement
 */
async function notifyAnnouncementCreated(announcement, courseData, teacherId, teacherName, studentIds = []) {
  try {
    console.log(`\n🔔 Creating announcement notification...`);
    console.log(`   Announcement: ${announcement.title}`);
    console.log(`   Course: ${courseData.courseName || courseData.courseTitle}`);
    console.log(`   Students to notify: ${studentIds?.length || 0}`);
    
    const firebaseNotificationIds = [];

    // 1. Notify the teacher (creator)
    const teacherTitle = `Announcement Posted`;
    const teacherMessage = `You posted "${announcement.title}" in ${courseData.courseName || courseData.courseTitle}`;
    
    try {
      const teacherNotifId = await addFirebaseNotification(teacherId, {
        type: 'announcement-created',
        recipientRole: 'teacher',
        title: teacherTitle,
        message: teacherMessage,
        announcementId: announcement._id.toString(),
        announcementTitle: announcement.title,
        courseId: courseData._id || courseData.id,
        courseName: courseData.courseName || courseData.courseTitle,
        courseCode: courseData.courseCode,
        createdById: teacherId,
        createdByName: teacherName,
        priority: announcement.priority || 'normal'
      });
      firebaseNotificationIds.push(teacherNotifId);
    } catch (error) {
      console.error(`   ❌ Failed to create teacher notification:`, error.message);
    }

    // 2. Notify registered students
    if (studentIds && studentIds.length > 0) {
      console.log(`   📝 Creating ${studentIds.length} student notifications...`);
      
      for (const studentId of studentIds) {
        const studentTitle = `New Announcement`;
        const studentMessage = `${teacherName} posted "${announcement.title}" in ${courseData.courseName || courseData.courseTitle}`;
        
        try {
          const studentNotifId = await addFirebaseNotification(studentId, {
            type: 'announcement-created',
            recipientRole: 'student',
            title: studentTitle,
            message: studentMessage,
            announcementId: announcement._id.toString(),
            announcementTitle: announcement.title,
            courseId: courseData._id || courseData.id,
            courseName: courseData.courseName || courseData.courseTitle,
            courseCode: courseData.courseCode,
            createdById: teacherId,
            createdByName: teacherName,
            priority: announcement.priority || 'normal'
          });
          firebaseNotificationIds.push(studentNotifId);
        } catch (error) {
          console.error(`   ⚠️ Failed to create student notification for ${studentId}:`, error.message);
        }
      }
      console.log(`✅ All student notifications created (${studentIds.length} students)`);
    }

    console.log(`\n✅ TOTAL ANNOUNCEMENT NOTIFICATIONS CREATED: ${firebaseNotificationIds.length}`);
    return { success: true, notificationIds: firebaseNotificationIds, total: firebaseNotificationIds.length };

  } catch (error) {
    console.error('❌ Error creating announcement notification:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Create notification when teacher updates course description
 */
async function notifyCourseUpdated(courseData, teacherId, teacherName, updateType = 'description') {
  try {
    console.log(`\n🔔 Creating course update notification...`);
    console.log(`   Course: ${courseData.courseName || courseData.courseTitle}`);
    console.log(`   Update type: ${updateType}`);
    
    // Notify teacher
    const teacherTitle = `Course Updated`;
    const teacherMessage = `You updated ${updateType} for ${courseData.courseName || courseData.courseTitle}`;
    
    await addFirebaseNotification(teacherId, {
      type: 'course-updated',
      recipientRole: 'teacher',
      title: teacherTitle,
      message: teacherMessage,
      courseId: courseData._id || courseData.id,
      courseName: courseData.courseName || courseData.courseTitle,
      courseCode: courseData.courseCode,
      updateType: updateType,
      createdById: teacherId,
      createdByName: teacherName
    });

    console.log(`✅ Teacher notified of course update`);

    // Notify registered students so it appears in the student bell toggle.
    // Students store Firestore course doc ids in `users.registeredCourses`.
    const externalCourseId = String(courseData?.id || courseData?._id || "").trim();
    if (!externalCourseId) {
      console.warn("⚠️ notifyCourseUpdated: missing courseData.id (externalCourseId); skipping student fan-out");
      return;
    }

    let studentCount = 0;
    try {
      const registeredSnapshot = await firestore
        .collection("users")
        .where("registeredCourses", "array-contains", externalCourseId)
        .get();

      for (const studentDoc of registeredSnapshot.docs) {
        const studentData = studentDoc.data() || {};
        if (studentData.role && studentData.role !== "student") continue;

        try {
          await addFirebaseNotification(studentDoc.id, {
            type: "course-updated",
            recipientRole: "student",
            title: "Course Updated",
            message: `${teacherName} updated ${updateType} for ${courseData.courseName || courseData.courseTitle}`,
            courseId: externalCourseId,
            courseName: courseData.courseName || courseData.courseTitle,
            courseCode: courseData.courseCode,
            updateType,
            createdById: teacherId,
            createdByName: teacherName,
          });
          studentCount += 1;
        } catch (e) {
          console.error(`⚠️ Failed to notify student ${studentDoc.id} for course update:`, e?.message || e);
        }
      }
    } catch (e) {
      console.error("⚠️ Failed to query registered students for course update:", e?.message || e);
    }

    console.log(`✅ Students notified of course update: ${studentCount}`);
  } catch (error) {
    console.error('❌ Error creating course update notification:', error.message);
  }
}

/**
 * Create notification when teacher uploads course material (slides/books).
 * Sends to all admins so it appears in admin popup + notifications page.
 */
async function notifyCourseMaterialUploaded(material, courseData, teacherId) {
  try {
    const fileName = material?.originalFileName || material?.fileName || 'course material';
    const courseName = courseData?.courseTitle || courseData?.courseName || courseData?.courseCode || 'a course';
    const courseCode = courseData?.courseCode || '';
    const externalCourseId = material?.externalCourseId || '';

    // Resolve teacher display name from Firebase
    let teacherName = 'Teacher';
    try {
      const teacherDoc = await firestore.collection('users').doc(teacherId).get();
      if (teacherDoc.exists) {
        const teacherData = teacherDoc.data() || {};
        teacherName = teacherData.name || teacherData.fullName || teacherData.email || teacherName;
      }
    } catch (e) {
      console.warn('⚠️ Could not fetch teacher name for material upload notification');
    }

    const adminsSnapshot = await firestore.collection('users').where('role', '==', 'admin').get();
    if (adminsSnapshot.empty) {
      console.log('ℹ️ No admins found to notify for material upload');
      // continue; students might still exist
    }

    const title = 'Course material uploaded';
    const message = `${teacherName} uploaded ${fileName} slides of ${courseName}`;
    const materialId = material?._id?.toString?.() || material?.id || "";

    let created = 0;
    if (!adminsSnapshot.empty) {
      for (const adminDoc of adminsSnapshot.docs) {
        try {
          await addFirebaseNotificationOnce(adminDoc.id, `admin_${adminDoc.id}_material_${materialId}`, {
            type: 'course-material-uploaded',
            recipientRole: 'admin',
            title,
            message,
            courseId: courseData?._id?.toString?.() || courseData?.id || undefined,
            courseCode,
            courseName,
            externalCourseId: externalCourseId || undefined,
            materialId: material?._id?.toString?.() || material?.id || undefined,
            fileName,
            createdById: teacherId,
            createdByName: teacherName,
            actionType: 'open_course_materials',
          });
          created += 1;
        } catch (err) {
          console.error(`⚠️ Failed to notify admin ${adminDoc.id} for material upload:`, err.message);
        }
      }
    }

    // Notify registered students (by Firebase course id stored in users.registeredCourses).
    let studentCreated = 0;
    if (externalCourseId) {
      try {
        const registeredSnapshot = await firestore
          .collection('users')
          .where('registeredCourses', 'array-contains', externalCourseId)
          .get();

        for (const studentDoc of registeredSnapshot.docs) {
          const studentData = studentDoc.data() || {};
          if (studentData.role && studentData.role !== 'student') continue;

          try {
            await addFirebaseNotificationOnce(studentDoc.id, `student_${studentDoc.id}_material_${materialId}`, {
              type: 'course-material-uploaded',
              recipientRole: 'student',
              title: 'New course material',
              message,
              courseId: courseData?._id?.toString?.() || courseData?.id || undefined,
              courseCode,
              courseName,
              externalCourseId,
              materialId: material?._id?.toString?.() || material?.id || undefined,
              fileName,
              createdById: teacherId,
              createdByName: teacherName,
              actionType: 'open_course_materials',
            });
            studentCreated += 1;
          } catch (err) {
            console.error(`⚠️ Failed to notify student ${studentDoc.id} for material upload:`, err.message);
          }
        }
      } catch (err) {
        console.error('⚠️ Failed to query registered students for material upload:', err.message);
      }
    } else {
      console.warn('⚠️ material.externalCourseId missing; cannot notify registered students');
    }

    console.log(`✅ Notifications created for material upload: admins=${created}, students=${studentCreated}`);
    return { success: true, total: created + studentCreated };
  } catch (error) {
    console.error('❌ Error creating material upload notifications:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  notifyAssessmentCreated,
  notifySubmissionCreated,
  logSubmissionActivity,
  notifySubmissionGraded,
  notifyStudentRegistered,
  notifyAnnouncementCreated,
  notifyCourseUpdated,
  notifyCourseMaterialUploaded,
  markNotificationsAsRead,
  getUnreadCount
};
