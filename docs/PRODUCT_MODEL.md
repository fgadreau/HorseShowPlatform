# Product Model

## Core Principle

The competitor should complete almost all day-to-day data entry themselves.

Association admins and secretaries can still create or correct data, but that path is a back-office support workflow, not the primary product flow.

## Main Spaces

### My Space

For competitors, owners, agents and riders.

Expected workflows:

- Manage my horses
- Manage my riders/contacts
- Create my entries
- Reserve stalls and extras
- Review and pay my invoices
- Scratch an entry or request a refund

### Association

For organization admins, show secretaries and show organizers.

Expected workflows:

- Configure shows
- Configure classes, divisions and pricing
- Search existing contacts, horses and entries
- Create or edit records on behalf of competitors when needed
- Manage invoices, payments, scratches and refunds
- Publish schedules, draws and results

## Admin Data Entry

Admin data entry should avoid large dropdown menus. As the system grows, selectors for horses, riders, contacts, owners, payers and entries must be search-first.

Short lists such as status, language or role can remain dropdowns.

## Class Program Structure

The scheduling and sanctioning model should follow this hierarchy:

- Real show
- Slate / technical show
- Class block
- Division

A slate is a technical show for sanctioning bodies such as NRHA. For example, NRHA does not accept two `1100 Open` divisions inside the same technical show, so a real event running that division twice needs a second slate.

A class block is the schedule object. It can contain mixed divisions, such as NRHA, house, AQR or other divisions running together.

The official sanctioned identity belongs on the division. For NRHA, fields such as `1100 Open` and the NRHA class category belong on the division or division preset, not on the class block.

## Editability

Most records created in the MVP must be editable:

- Shows
- Contacts
- Horses
- Classes
- Divisions
- Draft entries

Future restrictions can be added once records move into sensitive states, such as paid invoices, completed entries or audited payment records.
