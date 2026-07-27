/**
 * Department Controller
 * Department CRUD and listing
 */

const Department = require("../models/Department");
const User = require("../models/User");
const catchAsync = require("../utils/catchAsync");
const {
  NotFoundError,
  ConflictError,
  BadRequestError,
} = require("../utils/AppError");
const { success, paginationMeta } = require("../utils/apiResponse");
const { escapeRegex } = require("../utils/escapeRegex");

/**
 * List all departments
 * GET /api/v1/departments
 */
const listDepartments = catchAsync(async (req, res) => {
  const { page = 1, limit = 50, campus, search } = req.query;

  const query = {};

  if (campus) query.campus = campus;
  if (search) {
    query.name = { $regex: escapeRegex(search), $options: "i" };
  }

  const departments = await Department.find(query)
    .populate("hodId", "name email")
    .sort({ name: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await Department.countDocuments(query);

  return success(
    res,
    departments,
    "Departments retrieved",
    paginationMeta(page, limit, total, Math.ceil(total / limit)),
  );
});

/**
 * Get department by ID
 * GET /api/v1/departments/:id
 */
const getDepartment = catchAsync(async (req, res) => {
  const department = await Department.findById(req.params.id)
    .populate("hodId", "name email")
    .lean();

  if (!department) {
    throw new NotFoundError("Department not found");
  }

  // Get faculty count
  const facultyCount = await User.countDocuments({
    departmentId: department._id,
    role: { $in: ["faculty", "ms_student", "phd_student"] },
    status: "active",
  });

  return success(res, { ...department, facultyCount }, "Department retrieved");
});

/**
 * Create department (Admin)
 * POST /api/v1/admin/departments
 */
const createDepartment = catchAsync(async (req, res) => {
  const { name, campus, hodId } = req.body;

  // Check for duplicate name within campus
  const existing = await Department.findOne({ name, campus });
  if (existing) {
    throw new ConflictError(
      "Department with this name already exists in this campus",
    );
  }

  // Validate HOD if provided
  if (hodId) {
    const hod = await User.findById(hodId);
    if (!hod) {
      throw new NotFoundError("HOD user not found");
    }
    if (hod.role !== "hod") {
      throw new BadRequestError('User must have role "hod"');
    }
    if (hod.status !== "active") {
      throw new BadRequestError("HOD must be active");
    }

    // Check if user already HOD of another department
    const existingHodDept = await Department.findOne({ hodId });
    if (existingHodDept) {
      throw new ConflictError("User is already HOD of another department");
    }
  }

  const department = await Department.create({ name, campus, hodId });

  // Update user if HOD assigned
  if (hodId) {
    await User.findByIdAndUpdate(hodId, {
      departmentId: department._id,
      role: "hod",
    });
  }

  return success(res, department, "Department created", null, 201);
});

/**
 * Update department (Admin)
 * PATCH /api/v1/admin/departments/:id
 */
const updateDepartment = catchAsync(async (req, res) => {
  const { name, campus, hodId } = req.body;

  const department = await Department.findById(req.params.id);
  if (!department) {
    throw new NotFoundError("Department not found");
  }

  // Check for duplicate name
  if (name && name !== department.name) {
    const existing = await Department.findOne({
      name,
      campus: campus || department.campus,
    });
    if (existing && existing._id.toString() !== department._id.toString()) {
      throw new ConflictError(
        "Department with this name already exists in this campus",
      );
    }
  }

  // Handle HOD change
  if (hodId !== undefined) {
    // Clear current HOD
    if (department.hodId) {
      await User.findByIdAndUpdate(department.hodId, { role: "faculty" });
    }

    if (hodId) {
      const hod = await User.findById(hodId);
      if (!hod) {
        throw new NotFoundError("HOD user not found");
      }
      if (hod.role !== "hod") {
        throw new BadRequestError('User must have role "hod"');
      }
      if (hod.status !== "active") {
        throw new BadRequestError("HOD must be active");
      }

      // Check if user already HOD of another department
      const existingHodDept = await Department.findOne({ hodId });
      if (
        existingHodDept &&
        existingHodDept._id.toString() !== department._id.toString()
      ) {
        throw new ConflictError("User is already HOD of another department");
      }

      // Update user
      await User.findByIdAndUpdate(hodId, {
        departmentId: department._id,
        role: "hod",
      });
    }
  }

  // Update fields
  if (name) department.name = name;
  if (campus) department.campus = campus;
  if (hodId !== undefined) department.hodId = hodId || null;

  await department.save();

  return success(res, department, "Department updated");
});

/**
 * Delete department (Admin)
 * DELETE /api/v1/admin/departments/:id
 */
const deleteDepartment = catchAsync(async (req, res) => {
  const department = await Department.findById(req.params.id);
  if (!department) {
    throw new NotFoundError("Department not found");
  }

  // Check if department has users
  const userCount = await User.countDocuments({ departmentId: department._id });
  if (userCount > 0) {
    throw new BadRequestError(
      "Cannot delete department with assigned users. Reassign users first.",
    );
  }

  // Check if department still has publications referencing it —
  // deleting it anyway would leave those records with a dangling
  // departmentId reference (blank department/campus in exports, stats, etc.)
  const Publication = require("../models/Publication");
  const publicationCount = await Publication.countDocuments({ departmentId: department._id });
  if (publicationCount > 0) {
    throw new BadRequestError(
      "Cannot delete department with existing publications on record. Reassign or archive them first.",
    );
  }

  // Clear HOD reference
  if (department.hodId) {
    await User.findByIdAndUpdate(department.hodId, {
      role: "faculty",
      departmentId: null,
    });
  }

  await Department.findByIdAndDelete(req.params.id);

  return success(res, null, "Department deleted");
});

/**
 * Get department statistics
 * GET /api/v1/admin/departments/:id/stats
 */
const getDepartmentStats = catchAsync(async (req, res) => {
  const department = await Department.findById(req.params.id);
  if (!department) {
    throw new NotFoundError("Department not found");
  }

  // User stats
  const userStats = await User.aggregate([
    { $match: { departmentId: department._id } },
    { $group: { _id: "$role", count: { $sum: 1 } } },
  ]);

  // Publication stats
  const Publication = require("../models/Publication");
  const pubStats = await Publication.aggregate([
    { $match: { departmentId: department._id } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  // Verified publications by year
  const yearStats = await Publication.aggregate([
    { $match: { departmentId: department._id, status: "oric_verified" } },
    {
      $group: {
        _id: "$year",
        count: { $sum: 1 },
        citations: { $sum: "$citationCount" },
      },
    },
    { $sort: { _id: -1 } },
    { $limit: 10 },
  ]);

  // Top authors by h-index
  const AuthorProfile = require("../models/AuthorProfile");
  const topAuthors = await AuthorProfile.find({ departmentId: department._id })
    .populate("userId", "name email")
    .sort({ "metrics.hIndex": -1 })
    .limit(10)
    .select("userId metrics designation")
    .lean();

  return success(
    res,
    {
      department: {
        id: department._id,
        name: department.name,
        campus: department.campus,
      },
      users: userStats,
      publications: pubStats,
      publicationsByYear: yearStats,
      topAuthors,
    },
    "Department statistics retrieved",
  );
});

module.exports = {
  listDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getDepartmentStats,
};