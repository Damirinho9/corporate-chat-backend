const PERMISSIONS_MATRIX = [
    // === КАТЕГОРИЯ: Работа с сообщениями ===
    {
        id: 'editOwnMessages',
        label: 'Редактировать свои сообщения (до 5 минут после отправки)',
        category: 'messages',
        roles: {
            admin: true,
            assistant: true,
            rop: true,
            operator: true,
            employee: true
        },
        hint: 'Редактирование доступно всем ролям только в течение пяти минут после отправки собственного сообщения.'
    },
    {
        id: 'deleteOwnMessages',
        label: 'Удалять свои сообщения (до 5 минут после отправки)',
        category: 'messages',
        roles: {
            admin: true,
            assistant: true,
            rop: true,
            operator: true,
            employee: true
        },
        hint: 'Удаление доступно всем ролям в течение пяти минут после отправки собственного сообщения.'
    },
    {
        id: 'deleteAnyMessages',
        label: 'Удалять сообщения других участников',
        category: 'messages',
        roles: {
            admin: true,
            assistant: false,
            rop: 'department',
            operator: false,
            employee: false
        },
        hint: 'РОП может удалять сообщения только в чатах своего отдела; администратор — в любых чатах.'
    },
    {
        id: 'forwardMessages',
        label: 'Пересылать сообщения в другие чаты',
        category: 'messages',
        roles: {
            admin: true,
            assistant: true,
            rop: true,
            operator: true,
            employee: true
        },
        hint: 'Доступно всем ролям.'
    },
    {
        id: 'pinMessages',
        label: 'Закреплять сообщения',
        category: 'messages',
        roles: {
            admin: true,
            assistant: true,
            rop: true,
            operator: false,
            employee: false
        },
        hint: 'Доступно администраторам, ассистентам и РОПам.'
    },
    {
        id: 'viewDeletionHistory',
        label: 'Просматривать историю удалений',
        category: 'messages',
        roles: {
            admin: true,
            assistant: false,
            rop: true,
            operator: false,
            employee: false
        },
        hint: 'Доступно только администраторам и РОПам.'
    },

    // === КАТЕГОРИЯ: Управление чатами ===
    {
        id: 'createGroupChats',
        label: 'Создавать групповые чаты',
        category: 'chats',
        roles: {
            admin: true,
            assistant: true,
            rop: true,
            operator: true,
            employee: false
        },
        hint: 'Сотрудники не могут создавать групповые чаты.'
    },
    {
        id: 'createDepartmentChats',
        label: 'Создавать чаты отделов',
        category: 'chats',
        roles: {
            admin: true,
            assistant: false,
            rop: true,
            operator: false,
            employee: false
        },
        hint: 'Доступно администраторам и РОПам.'
    },
    {
        id: 'manageChats',
        label: 'Редактировать чаты (название, участники)',
        category: 'chats',
        roles: {
            admin: true,
            assistant: true,
            rop: 'department',
            operator: false,
            employee: false
        },
        hint: 'РОП может редактировать только чаты своего отдела.'
    },
    {
        id: 'deleteChats',
        label: 'Удалять чаты',
        category: 'chats',
        roles: {
            admin: true,
            assistant: false,
            rop: false,
            operator: false,
            employee: false
        },
        hint: 'Доступно только администраторам.'
    },

    // === КАТЕГОРИЯ: Управление пользователями ===
    {
        id: 'createUsers',
        label: 'Создавать новых пользователей',
        category: 'users',
        roles: {
            admin: true,
            assistant: false,
            rop: 'department',
            operator: false,
            employee: false
        },
        hint: 'РОП может создавать пользователей только в своём отделе.'
    },
    {
        id: 'editUsers',
        label: 'Редактировать данные пользователей',
        category: 'users',
        roles: {
            admin: true,
            assistant: false,
            rop: 'department',
            operator: false,
            employee: false
        },
        hint: 'РОП может редактировать только пользователей своего отдела.'
    },
    {
        id: 'deleteUsers',
        label: 'Удалять (деактивировать) пользователей',
        category: 'users',
        roles: {
            admin: true,
            assistant: false,
            rop: 'department',
            operator: false,
            employee: false
        },
        hint: 'РОП может удалять только пользователей своего отдела.'
    },
    {
        id: 'viewAllUsers',
        label: 'Просматривать всех пользователей системы',
        category: 'users',
        roles: {
            admin: true,
            assistant: true,
            rop: 'department',
            operator: true,
            employee: false
        },
        hint: 'РОП видит только пользователей своего отдела.'
    },

    // === КАТЕГОРИЯ: Управление отделами ===
    {
        id: 'createDepartments',
        label: 'Создавать отделы',
        category: 'departments',
        roles: {
            admin: true,
            assistant: false,
            rop: false,
            operator: false,
            employee: false
        },
        hint: 'Доступно только администраторам.'
    },
    {
        id: 'editDepartments',
        label: 'Редактировать отделы',
        category: 'departments',
        roles: {
            admin: true,
            assistant: false,
            rop: false,
            operator: false,
            employee: false
        },
        hint: 'Доступно только администраторам.'
    },
    {
        id: 'assignDepartmentHeads',
        label: 'Назначать РОПов отделов',
        category: 'departments',
        roles: {
            admin: true,
            assistant: false,
            rop: false,
            operator: false,
            employee: false
        },
        hint: 'Доступно только администраторам.'
    },

    // === КАТЕГОРИЯ: Система поддержки ===
    {
        id: 'createSupportTickets',
        label: 'Создавать тикеты поддержки',
        category: 'support',
        roles: {
            admin: true,
            assistant: true,
            rop: true,
            operator: true,
            employee: true
        },
        hint: 'Доступно всем ролям.'
    },
    {
        id: 'manageSupportTickets',
        label: 'Управлять тикетами (назначение, изменение статуса)',
        category: 'support',
        roles: {
            admin: true,
            assistant: true,
            rop: false,
            operator: false,
            employee: false
        },
        hint: 'Доступно администраторам и ассистентам.'
    },
    {
        id: 'viewSupportAnalytics',
        label: 'Просматривать аналитику по тикетам',
        category: 'support',
        roles: {
            admin: true,
            assistant: true,
            rop: false,
            operator: false,
            employee: false
        },
        hint: 'Доступно администраторам и ассистентам.'
    },

    // === КАТЕГОРИЯ: Файлы ===
    {
        id: 'uploadFiles',
        label: 'Загружать файлы в сообщения',
        category: 'files',
        roles: {
            admin: true,
            assistant: true,
            rop: true,
            operator: true,
            employee: true
        },
        hint: 'Доступно всем ролям (макс 10MB).'
    },
    {
        id: 'deleteFiles',
        label: 'Удалять файлы из системы',
        category: 'files',
        roles: {
            admin: true,
            assistant: false,
            rop: false,
            operator: false,
            employee: false
        },
        hint: 'Доступно только администраторам.'
    },

    // === КАТЕГОРИЯ: Аналитика и логи ===
    {
        id: 'viewAnalytics',
        label: 'Просматривать общую аналитику',
        category: 'analytics',
        roles: {
            admin: true,
            assistant: true,
            rop: 'department',
            operator: false,
            employee: false
        },
        hint: 'РОП видит аналитику только по своему отделу.'
    },
    {
        id: 'viewSystemLogs',
        label: 'Просматривать системные логи',
        category: 'analytics',
        roles: {
            admin: true,
            assistant: false,
            rop: false,
            operator: false,
            employee: false
        },
        hint: 'Доступно только администраторам.'
    }
];

module.exports = {
    PERMISSIONS_MATRIX
};
