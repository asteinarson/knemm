# Database connection specifier
To be able to specify connection details for a specific database from the CLI, a simple syntax was 
developed. This example tests if a database `my_db` exists on the PostgresQL client:  
```bash 
$ knedb exists @pg:my_db   
no
```
The dbspec string format is used in all `knedb` commands and also in any of the `knemm` commands 
that interface a database. 

For most clients, more information than the database name is needed. It can either be specified directly 
in the DB specifier string, or if not there, two fallback levels are used, to look for default values. 
The whole lookup process, for connection data becomes: 

 1. Anything specified in the dbspec string has highest priority.
 2. If the DB spec gives a JSON/YAML file to consult, it next looks in that.
 3. It lastly looks in environment variables (including parsing the `.env` file).

## Syntax of the DB spec string
Different "rare" characters are used to mark the beginning of each field. They are: 
 - `%` - This marks that the name of a JSON/YAML file will follow next. Example:
   - `%new_shop-stage.json` 
   - If no filename is given, an attemt is used to load one of `%.json` or `%.yaml` 
 - `:` - This specifies the database name
   - `:my_app_name` 
 - `@` - The client type name follows:
   - `@mysql`
 - `=` - A host name or IP address follows 
   - `=192.168.0.123`
  
### User and password specification:
If a username is specified, it is the first part of the dbspec string:
 - `bob@mysql:test_db`

A password can be added via `?`: 
 - `bob?bobs_pass@mysql:test_db`

### Escaping characters in other fields
Currently escaping is not implemented in the fields of the dbspec string. It means a password cannot 
contain any of these characters: 
  * `? @ % : =`
