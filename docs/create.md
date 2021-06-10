## [Back to index](index.md)

# create
```
knedb create <db_spec> <name_of_new_db>
```
The command will create a database according to `dbspec` named `name_of_new_db`. If the name of 
the new database is included in `dbspec` (as maybe when refering to a JSON/YAML file with connection info), then it is enough to give a colon - `:` - meaning it will use the name given. Otheriwse, we can override the name with the second arg. 

## Example
```bash
$ knedb create arst?the_pass@pg:test14 : 
Database <test14> on client type <pg> was created.
```

When using a DB connection file `my_db.json`: 
```bash
$ knedb create %my_db.json :my_new_db
Database <my_new_db> on client type <mysql> was created.
```

## Options
| Short form | Long form | Explanation | 
| --- | --- | --- | 
| `-s` | `--state <dir>` | If a state is given the command will connect the state with this DB (like running a `knemm connect` command) | 
| `-r` | `--replace` | Together with `-s` the command will replace a previous DB connection for a state | 
| `-o` | `--outfile <new_db_file>` | Outputs a new DB file for the DB connection | 
| `-j` | `--json` | Generate output file (if any) in JSON - not in YAML | 
