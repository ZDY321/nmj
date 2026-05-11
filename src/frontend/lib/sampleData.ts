import type { TeacherVault } from "../../shared/types";

export const defaultNotice = {
  enabled: true,
  title: "系统公告",
  content: "月底核对前请确认请假、补课和课时记录。敏感数据只在本人浏览器解密。",
  updatedAt: "2026-05-10T00:00:00.000Z"
};

export function createSampleVault(): TeacherVault {
  return {
    version: 1,
    profile: {
      displayName: "牛马",
      baseSalary: 3200,
      currency: "CNY",
      homeCampusId: "campus_main",
      obligationCampusId: "campus_main",
      obligationCourseGroupId: "course_class_math",
      obligationDeductionMode: "auto_gap",
      monthlyObligationHours: 8,
      obligationHourlyDeduction: 80,
      manualObligationDeduction: 0,
      phone: "",
      email: "",
      note: "中心校区承担义务课时核扣。"
    },
    preferences: {
      weekStartsOn: 0,
      customTimePresets: []
    },
    notice: defaultNotice,
    campuses: [
      { id: "campus_main", name: "中心校区", address: "A 座 3 楼" },
      { id: "campus_west", name: "西区校区", address: "教学楼 202" }
    ],
    students: [
      { id: "student_a", name: "学生 A", grade: "初三", school: "第一中学", defaultCampusId: "campus_main", status: "active" },
      { id: "student_b", name: "学生 B", grade: "初二", school: "实验中学", defaultCampusId: "campus_main", status: "active" },
      { id: "student_c", name: "学生 C", grade: "初二", school: "实验中学", defaultCampusId: "campus_west", temporaryTrial: true, status: "active" },
      { id: "student_d", name: "学生 D", grade: "初三", school: "外国语学校", defaultCampusId: "campus_main", status: "active" }
    ],
    courseGroups: [
      {
        id: "course_one_math",
        name: "学生 A 一对一",
        type: "one_on_one",
        subject: "数学",
        defaultCampusId: "campus_main",
        studentIds: ["student_a"],
        feeRule: { mode: "hourly", hourlyRate: 220 },
        status: "active"
      },
      {
        id: "course_class_math",
        name: "初中数学班课",
        type: "class",
        subject: "数学",
        defaultCampusId: "campus_west",
        studentIds: ["student_b", "student_c", "student_d"],
        feeRule: {
          mode: "class_headcount",
          baseFee: 80,
          perPresentStudentFee: 10,
          makeupFeeMode: "perStudentFee"
        },
        status: "active"
      }
    ],
    scheduleRules: [
      {
        id: "rule_a_wed",
        courseGroupId: "course_one_math",
        weekday: 3,
        startTime: "19:00",
        endTime: "21:00",
        campusId: "campus_main",
        effectiveFrom: "2026-05-01",
        enabled: true
      },
      {
        id: "rule_class_sat",
        courseGroupId: "course_class_math",
        weekday: 6,
        startTime: "09:00",
        endTime: "11:00",
        campusId: "campus_west",
        effectiveFrom: "2026-05-01",
        enabled: true
      }
    ],
    lessons: [
      {
        id: "lesson_20260506_a",
        date: "2026-05-06",
        startTime: "19:00",
        endTime: "21:00",
        courseGroupId: "course_one_math",
        campusId: "campus_main",
        type: "one_on_one",
        status: "completed",
        expectedStudentIds: ["student_a"],
        attendance: [{ studentId: "student_a", status: "attended" }],
        feeSnapshot: { hourlyRate: 220, hours: 2, amount: 440 },
        linkedOriginalLessonId: null,
        content: {
          taught: "一次函数图像与应用题",
          performance: "计算稳定，应用题读题还需要慢一点。",
          homework: "完成函数练习 3-4 页。",
          nextLessonReminder: "先检查函数练习错题，再讲二次函数概念。",
          internalNote: ""
        }
      },
      {
        id: "lesson_20260509_class",
        date: "2026-05-09",
        startTime: "09:00",
        endTime: "11:00",
        courseGroupId: "course_class_math",
        campusId: "campus_west",
        type: "class",
        status: "makeup_pending",
        expectedStudentIds: ["student_b", "student_c", "student_d"],
        attendance: [
          { studentId: "student_b", status: "attended" },
          { studentId: "student_c", status: "leave_requested", note: "需补课" },
          { studentId: "student_d", status: "attended" }
        ],
        feeSnapshot: {
          baseFee: 80,
          perPresentStudentFee: 10,
          presentStudentCount: 2,
          amount: 100
        },
        linkedOriginalLessonId: null,
        content: {
          taught: "整式乘法",
          performance: "B、D 完成度较好，C 请假。",
          homework: "完成整式乘法小卷。",
          nextLessonReminder: "检查小卷，C 需要安排补课。",
          internalNote: ""
        }
      },
      {
        id: "lesson_today_a",
        date: "2026-05-10",
        startTime: "16:00",
        endTime: "18:00",
        courseGroupId: "course_one_math",
        campusId: "campus_main",
        type: "one_on_one",
        status: "scheduled",
        expectedStudentIds: ["student_a"],
        attendance: [{ studentId: "student_a", status: "attended" }],
        feeSnapshot: { hourlyRate: 220, hours: 2, amount: 440 },
        linkedOriginalLessonId: null,
        content: {
          taught: "",
          performance: "",
          homework: "",
          nextLessonReminder: "先检查函数练习 3-4 页。",
          internalNote: ""
        }
      }
    ],
    salaryAdjustments: [
      {
        id: "adjust_transport",
        month: "2026-05",
        title: "交通补贴",
        amount: 120,
        note: "跨校区补贴"
      }
    ],
    todoItems: [
      {
        id: "todo_month_check",
        title: "月底前核对补课与取消备注",
        dueDate: "2026-05-31",
        status: "open",
        priority: "high",
        createdAt: "2026-05-10T00:00:00.000Z"
      }
    ],
    gradeRecords: [
      {
        id: "grade_student_a_mid",
        studentId: "student_a",
        subject: "数学",
        examName: "期中考试",
        date: "2026-05-08",
        score: 86,
        fullScore: 100,
        rank: "班级前 20%",
        note: "函数题稳定，几何证明还要加强。"
      }
    ]
  };
}
