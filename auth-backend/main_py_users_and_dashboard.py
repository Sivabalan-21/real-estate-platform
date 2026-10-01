# PASTE into auth-backend/main.py, REPLACING your existing `@app.get("/users") def get_users(...)` function.
# Also needs these import changes at the top of main.py:
#   from fastapi import ..., Query, ...
#   from sqlalchemy import case, func
# And in GET /companies?scope=all add this key to each returned dict:
#   "created_at": c.created_at.isoformat() if c.created_at else None,

# Display order for the user-management table: highest role first.
_ROLE_SORT_ORDER = [
    ROLE_COMPANY_ADMIN, ROLE_ADMIN, ROLE_PROPERTY_MANAGER,
    ROLE_OWNER, ROLE_TENANT, ROLE_VENDOR,
]


def _like_pattern(term: str) -> str:
    """Build a case-insensitive contains pattern, escaping LIKE wildcards so a
    search for '50%' or 'a_b' is treated literally."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@app.get("/users")
def get_users(
    search: str | None = Query(None, max_length=100),
    company_id: str | None = None,
    role: str | None = None,
    status: str | None = None,
    page: int | None = Query(None, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """List users.

    Without `page` this behaves exactly as before (a plain JSON array) so
    existing callers keep working. Filters (search / company_id / role /
    status) apply in both modes.

    With `page` it returns {items, total, page, page_size, pages} for the
    Super Admin user-management table. In that mode Super Admin accounts are
    left out (same as /users/my-hierarchy) and rows are ordered by role rank,
    then username.

    `search` is one case-insensitive box matched in the database against
    username, full name, email, role, status and the company's name, code and
    slug.
    """
    if user.role not in (ROLE_SUPER_ADMIN, ROLE_COMPANY_ADMIN, ROLE_ADMIN, ROLE_PROPERTY_MANAGER):
        raise HTTPException(403, "Not authorized")

    query = db.query(User).outerjoin(Company, User.company_id == Company.id)

    # Tenancy: everyone except Super Admin is pinned to their own company,
    # whatever company_id the client sends.
    if user.role != ROLE_SUPER_ADMIN:
        query = query.filter(User.company_id == user.company_id)
    elif company_id:
        query = query.filter(User.company_id == company_id)

    if page is not None:
        query = query.filter(User.role != ROLE_SUPER_ADMIN)

    if role:
        query = query.filter(User.role == role)
    if status:
        query = query.filter(func.lower(User.status) == status.strip().lower())

    term = (search or "").strip()
    if term:
        pattern = _like_pattern(term)
        query = query.filter(or_(
            User.username.ilike(pattern, escape="\\"),
            User.full_name.ilike(pattern, escape="\\"),
            User.email.ilike(pattern, escape="\\"),
            User.role.ilike(pattern, escape="\\"),
            User.status.ilike(pattern, escape="\\"),
            Company.name.ilike(pattern, escape="\\"),
            Company.company_code.ilike(pattern, escape="\\"),
            Company.slug.ilike(pattern, escape="\\"),
        ))

    def _row(u: User):
        return {
            "user_id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "status": u.status,
            "company_id": u.company_id,
            "company_name": u.company.name if u.company else None,
            "company_code": u.company.company_code if u.company else None,
            "company_slug": u.company.slug if u.company else None,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }

    if page is None:
        return [_row(u) for u in query.all()]

    role_rank = case(
        {r: i for i, r in enumerate(_ROLE_SORT_ORDER)},
        value=User.role,
        else_=len(_ROLE_SORT_ORDER),
    )
    total = query.count()
    rows = (
        query.order_by(role_rank, func.lower(func.coalesce(User.username, User.email)), User.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "items": [_row(u) for u in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
    }


@app.get("/admin/dashboard")
def admin_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Super Admin dashboard numbers, computed live from the database."""
    if user.role != ROLE_SUPER_ADMIN:
        raise HTTPException(403, "Not authorized")

    counts = dict(
        db.query(User.role, func.count(User.id))
        .filter(User.role != ROLE_SUPER_ADMIN)
        .group_by(User.role)
        .all()
    )
    role_counts = {r: counts.get(r, 0) for r in _ROLE_SORT_ORDER}

    company_rows = (
        db.query(Company, func.count(User.id).label("user_count"))
        .outerjoin(User, User.company_id == Company.id)
        .group_by(Company.id)
        .order_by(func.lower(Company.name))
        .all()
    )

    return {
        "total_companies": len(company_rows),
        "total_users": sum(role_counts.values()),
        "role_counts": role_counts,
        "companies": [
            {
                "id": c.id,
                "name": c.name,
                "company_code": c.company_code,
                "slug": c.slug,
                "user_count": n,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c, n in company_rows
        ],
    }