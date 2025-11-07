const PERMISSIONS_MATRIX = [
    {
        id: 'deleteOwnMessages',
        label: 'Удалять свои сообщения (до 5 минут после отправки)',
        roles: {
            admin: true,
            assistant: true,
            rop: true,
            operator: true,
            employee: true
        },
        hint: 'Доступно всем ролям в течение пяти минут после отправки собственного сообщения.'
    },
    {
        id: 'deleteAnyMessages',
        label: 'Удалять сообщения других участников',
        roles: {
            admin: true,
            assistant: false,
            rop: 'department',
            operator: false,
            employee: false
        },
        hint: 'РОП может удалять сообщения только в чатах своего отдела; администратор — в любых чатах.'
    }
];

module.exports = {
    PERMISSIONS_MATRIX
};
