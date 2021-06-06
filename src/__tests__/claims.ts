
// Need a test to be in this file 
test("claims dummy test", () => {
    expect(1).toBe(1);
});

import {Claim, State} from "../types";
import { deepCopy } from "../utils";

export let claim_p1: Claim = {
    format: "internal",
    id: {
        branch: "p",
        version: 1
    },
    ___tables: {
        person: {
            id: {
                data_type: "int",
                is_primary_key: true,
                has_auto_increment: true
            },
            name: {
                data_type: "varchar",
                max_length: 32,
            },
        },
    }
};

export let claim_p2: Claim = {
    format: "internal",
    id: {
        branch: "p",
        version: 2
    },
    ___tables: {
        person: {
            name: {
                // Change the data type 
                data_type: "text",
            },
            age: {
                // A new column 
                data_type: "int",
            },
        },
    }
};

export let state_p2: State = {
    format: "internal",
    modules: {},
    ___tables: {
        person: {
            id: {
                data_type: "int",
                is_primary_key: true,
                has_auto_increment: true
            },
            name: {
                data_type: "text"
            },
        },
    }
};

export let claim_use_p1: Claim = {
    format: "internal",
    id: {
        branch: "up",
        version: 1
    },
    depends: {
        p: {
            ___version: 1,
            person: {
                name: {
                    data_type: "text"
                }
            }
        }
    },
    ___tables: {
    }
};


export let claim_use_p2: Claim = {
    format: "internal",
    id: {
        branch: "up",
        version: 1
    },
    depends: {
        p: {
            ___version: 2,
            person: {
                name: {
                    data_type: "text"
                }
            }
        }
    },
    ___tables: {
    }
};

export let claim_p3: Claim = {
    format: "internal",
    id: {
        branch: "p",
        version: 3
    },
    ___tables: {
        person: {
            age: {
                // Change type of our column 
                data_type: "bigint",
            },
            yob: {
                // A new column 
                data_type: "int",
                is_nullable: false,
            },
        },
    }
};

export let claim_use_p3: Claim = {
    format: "internal",
    id: {
        branch: "up",
        version: 3
    },
    depends: {
        p: {
            ___version: 3,
            person: {
                age: {
                    data_type: "int"
                },
                yob: {
                    // Exact ref, both type and property
                    data_type: "int",
                    is_nullable: false,
                },
            },
        }
    },
    ___tables: {
    }
};

export let claim_use_p3_err: Claim = {
    format: "internal",
    id: {
        branch: "up",
        version: 4
    },
    ___tables: {
        person: {
            yob: {
                // Wrong ref, both type and property
                ref_data_type: "bigint",
                is_nullable: true,
            },
        },
    }
};

export let claim_p4: Claim = {
    format: "internal",
    id: {
        branch: "p",
        version: 4
    },
    ___tables: {
        person: {
            // Try remove column, is reffed, should fail 
            age: "*NOT",
            yob: {
                // Is reffed property, change should fail 
                is_nullable: true,
            },
        },
    }
};

export let claim_use_p3_ok: Claim = {
    format: "internal",
    id: {
        branch: "up",
        version: 4
    },
    depends: {
        p: {
            ___version: 3,
            person: {
                age: "*UNREF",
                yob: {
                    is_nullable: "*UNREF" as any,
                },
            },
        }
    },
    ___tables: {
    }
};



export let claim_apply_simple_types: Claim = {
    format: "?",    // Enforce translate to internal
    id: {
        branch: "apply-st",
        version: 1
    },
    ___tables: {
        person: {
            name: "text",
            active: "boolean",
            age: "int",
            length: "float",
            length_prec: "double",
            age_in_seconds: "bigint",
            income: "decimal(5,3)",
            date1: "date",
            datetime1: "datetime",
            timestamp1: "timestamp",
        },
    }
};


export let claim_author_1: Claim = {
    format: "internal",
    id: {
        branch: "author",
        version: 1
    },
    ___tables: {
        author: {
            id: {
                data_type: "int",
                is_primary_key: true,
                has_auto_increment: true
            },
            name: {
                data_type: "varchar",
                max_length: 32,
                default: "James",
            },
            age: {
                data_type: "int",
                is_nullable: false,
            },
        },
    }
};

export let claim_author_2: Claim = {
    format: "internal",
    id: {
        branch: "author",
        version: 2
    },
    ___tables: {
        author: {
            // Cannot expand a primary key for now
            // id: {
            //     data_type: "bigint",
            // },
            name: {
                data_type: "text",
            },
            age: {
                data_type: "bigint",
            },
        },
    }
};

export let claim_author_3: Claim = {
    format: "internal",
    id: {
        branch: "author",
        version: 3
    },
    ___tables: {
        author: {
            //id: {
            //    is_primary_key: false,
            //},
            name: {
                default: null as any,
            },
            age: {
                is_nullable: true,
            },
        },
    }
};


export let claim_customer_1: Claim = {
    format: "internal",
    id: {
        branch: "customer",
        version: 1
    },
    ___tables: {
        customer: {
            id: {
                data_type: "int",
                is_primary_key: true,
            },
            name: {
                data_type: "text",
                default: "Dolly",
            },
            email: {
                data_type: "text",
                //is_unique: true,
                is_nullable: false,
            },
            age: {
                data_type: "int",
                //is_nullable: false,
                is_unique: true,
            },
        },
    }
};

export let claim_customer_2: Claim = {
    format: "internal",
    id: {
        branch: "customer",
        version: 2
    },
    ___tables: {
        customer: {
            //id: {
            //    is_primary_key: false,
            //},
            name: {
                default: null as any,
            },
            email: {
                data_type: "text",
                is_unique: false,
            },
            age: {
                data_type: "int",
                is_nullable: true,
            },
        },
    }
};

export let claim_book_1: Claim = {
    format: "internal",
    id: {
        branch: "book",
        version: 1
    },
    depends: {
        author: {
            ___version: 2,
            author: {
                id: {
                    data_type: "int",
                }
            }
        },
    },
    ___tables: {
        book: {
            id: {
                data_type: "int",
                is_primary_key: true,
            },
            name: {
                data_type: "text",
                is_nullable: false,
            },
            author_id: {
                data_type: "int",
                foreign_key: {
                    table: "author",
                    column: "id",
                },
            }
        }
    }
};

export let claim_book_2: Claim = {
    format: "internal",
    id: {
        branch: "book",
        version: 2
    },
    ___tables: {
        book: {
            author_id: {
                foreign_key: "*NOT",
            }
        }
    }
};

export let claim_book_3_fail: Claim = {
    format: "internal",
    id: {
        branch: "book",
        version: 3
    },
    ___tables: {
        book: {
            name: {
                foreign_key: {
                    table: "author",
                    column: "id",
                },
            }
        }
    }
};

export let claim_book_3: Claim = {
    format: "internal",
    id: {
        branch: "book",
        version: 3
    },
    ___tables: {
        book: {
            name: "*NOT"
        }
    }
};

export let claim_book_4: Claim = {
    format: "internal",
    id: {
        branch: "book",
        version: 4
    },
    ___tables: {
        book: "*NOT",
    }
};
