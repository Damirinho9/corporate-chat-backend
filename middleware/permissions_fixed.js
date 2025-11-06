// Заменяем строки 115-125
        // For department chats, allow heads and operators of same department
        if (chat.type === 'department') {
            // Allow head of the department
            if ((userRole === 'rop' || userRole === 'head') && userDept === chat.department) {
                return next();
            }
            // Allow operators of the same department
            if (userRole === 'operator' && userDept === chat.department) {
                return next();
            }
            // Allow admin
            if (userRole === 'admin') {
                return next();
            }
            // Deny others
            return res.status(403).json({ 
                error: 'Only department members can send messages in department chats',
                code: 'DEPARTMENT_ONLY'
            });
        }
