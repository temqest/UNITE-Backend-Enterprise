import { Router } from 'express';
import { authRouter } from './auth';
import { eventsRouter } from './events';
import { notificationsRouter } from './notifications';
import { settingsRouter } from './settings';
import { usersRouter } from './users';
import { organizationsRouter } from './organizations';
import { geographicRouter } from './geographic';
import { inventoryRouter } from './inventory';
import { donorRouter } from './donor';
import { plottingCalendarsRouter } from './plotting-calendars';

const v1Router = Router();

v1Router.use('/auth', authRouter);
v1Router.use('/users', usersRouter);
v1Router.use('/events', eventsRouter);
v1Router.use('/plotting-calendars', plottingCalendarsRouter);
v1Router.use('/notifications', notificationsRouter);
v1Router.use('/settings', settingsRouter);
v1Router.use('/organizations', organizationsRouter);
v1Router.use('/geographic', geographicRouter);
v1Router.use('/inventory', inventoryRouter);
v1Router.use('/donor', donorRouter);

export { v1Router };
export default v1Router;
