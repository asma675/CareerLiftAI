import { useEffect, useState } from "react";
import "./AddCoursePage.scss";

const AddCoursePage = ({ db, userId }) => {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [success, setSuccess] = useState(null);

  const API_BASE = "http://localhost:4000"; // change if your backend uses another port

  const fetchCourses = async () => {
    try {
      setLoading(true);
      setListError(null);
      const res = await fetch(`${API_BASE}/api/courses`);
      const data = await res.json();
      setCourses(data || []);
    } catch (err) {
      setListError("Failed to load courses: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const handleOpenAdd = () => {
    setEditingCourse(null);
    setTitle("");
    setCategory("");
    setLevel("");
    setDescription("");
    setUrl("");
    setSaveError(null);
    setSuccess(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (course) => {
    setEditingCourse(course);
    setTitle(course.title || "");
    setCategory(course.category || "");
    setLevel(course.level || "");
    setDescription(course.description || "");
    setUrl(course.url || "");
    setSaveError(null);
    setSuccess(null);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setEditingCourse(null);
    setSaveError(null);
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!title || !category || !level) {
      setSaveError("Please fill in all required fields.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSuccess(null);

    try {
      const payload = {
        title,
        category,
        level,
        description,
        url,
        createdBy: userId || null,
      };

      let res;
      if (editingCourse) {
        res = await fetch(`${API_BASE}/api/courses/${editingCourse.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_BASE}/api/courses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save course");
      }

      setSuccess(editingCourse ? "Course updated successfully!" : "Course added successfully!");
      await fetchCourses();
      handleCloseDrawer();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this course?");
    if (!confirmDelete) return;

    try {
      const res = await fetch(`${API_BASE}/api/courses/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete course");
      }
      setCourses((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert("Error deleting course: " + err.message);
    }
  };

  return (
    <div className="courses-page">
      <div className="courses-header">
        <h2 className="section-title">Courses</h2>
        {!isDrawerOpen && (
          <button onClick={handleOpenAdd} className="btn btn-primary shadow-glow">
            + Add Course
          </button>
        )}
      </div>

      {listError && <p className="alert alert-error">{listError}</p>}
      {success && <p className="alert alert-success">{success}</p>}

      {loading ? (
        <p className="muted">Loading courses...</p>
      ) : courses.length === 0 ? (
        <p className="muted">No courses yet. Click “Add Course” to create one.</p>
      ) : (
        <div className="course-list">
          {courses.map((course) => (
            <div key={course.id} className="course-card">
              <div>
                <h3 className="course-card__title">{course.title}</h3>
                <p className="course-card__meta">
                  <span className="meta-label">Category:</span> {course.category || "N/A"}
                </p>
                <p className="course-card__meta">
                  <span className="meta-label">Level:</span> {course.level || "N/A"}
                </p>
                {course.description && <p className="course-card__desc">{course.description}</p>}
                {course.url && (
                  <a
                    href={course.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="course-card__link"
                  >
                    Open Course
                  </a>
                )}
              </div>

              <div className="course-card__actions">
                <button onClick={() => handleOpenEdit(course)} className="btn btn-ghost">
                  Edit
                </button>
                <button onClick={() => handleDelete(course.id)} className="btn btn-secondary">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isDrawerOpen && (
        <div className="course-drawer">
          <div className="course-drawer__header">
            <h3 className="drawer-title">{editingCourse ? "Edit Course" : "Add New Course"}</h3>
            <button onClick={handleCloseDrawer} className="drawer-close">
              ✕
            </button>
          </div>

          {saveError && <p className="alert alert-error">{saveError}</p>}

          <div className="form-grid">
            <label className="field-label">
              Course Title *
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Introduction to Cybersecurity"
              />
            </label>

            <label className="field-label">
              Category *
              <input
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ex: IT / Business / Engineering"
              />
            </label>

            <label className="field-label">
              Level *
              <select className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">Select...</option>
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
            </label>

            <label className="field-label">
              Short Description
              <textarea
                className="textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a short summary of the course..."
              />
            </label>

            <label className="field-label">
              Course URL
              <input
                className="input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/my-course"
              />
            </label>

            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary shadow-glow"
            >
              {saving ? "Saving..." : editingCourse ? "Update Course" : "Save Course"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddCoursePage;
